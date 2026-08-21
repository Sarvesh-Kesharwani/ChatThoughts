import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { DEFAULT_CONFLICT_PROMPT } from "@/lib/supabase";

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! });
const model = deepseek(process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash");

// Chunked summarization budget. Conservative char budgets keep every call
// inside the flash context window even with system prompt + structured output.
const INPUT_BUDGET_CHARS = 8_000;
const CHUNK_CHARS = 5_000;
const MAX_SUMMARY_ROUNDS = 5;

// Internal corpus caps so a large saved note can never overflow ranking /
// conflict / categorization prompts.
const CORPUS_ENTRY_CHARS = 2_000;
const CORPUS_TOTAL_CHARS = 16_000;

export type SchemaField = {
  key: string;
  label: string;
  type: "string" | "array";
  options?: string[];
};

export type OutputSchema = { fields: SchemaField[] };

function splitText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      const space = text.lastIndexOf(" ", end);
      const boundary = Math.max(newline, space);
      if (boundary > start + maxChars * 0.6) end = boundary;
    }
    if (end <= start) end = start + maxChars;
    const chunk = text.slice(start, end).trim();
    start = end;
    if (!chunk) continue;
    chunks.push(chunk);
  }
  return chunks;
}

async function summarizeChunk(
  chunk: string,
  index: number,
  total: number,
  round: number
): Promise<string> {
  const { text } = await generateText({
    model,
    system:
      "You condense a section of the user's raw note into a compact summary. Keep every fact, situation, feeling, name, number, and piece of advice. Preserve the original language and tone. Never add advice or interpretation. Output only the condensed text.",
    prompt:
      round === 1
        ? `Condense this part ${index + 1} of ${total} of the raw note. Keep all key details:\n\n${chunk}`
        : `These are summaries of the raw note. Merge and condense part ${index + 1} of ${total} into one tighter summary, keeping every remaining key detail:\n\n${chunk}`,
  });
  return text.trim();
}

async function summarizeWithConcurrency(
  chunks: string[],
  round: number
): Promise<string[]> {
  const results: string[] = new Array(chunks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length) {
      const i = cursor++;
      results[i] = await summarizeChunk(chunks[i], i, chunks.length, round);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, () => worker())
  );
  return results;
}

/**
 * Splits oversized input into chunks, summarizes each chunk, then merges the
 * summaries and repeats until the text fits the model's window. Falls back to
 * a hard truncation if the summary rounds cannot converge.
 */
export async function compressForModel(raw: string): Promise<string> {
  let text = raw.trim();
  for (let round = 1; round <= MAX_SUMMARY_ROUNDS; round++) {
    if (text.length <= INPUT_BUDGET_CHARS) return text;
    const chunks = splitText(text, CHUNK_CHARS);
    const parts = await summarizeWithConcurrency(chunks, round);
    text = parts.join("\n\n");
  }
  return text.length > INPUT_BUDGET_CHARS
    ? text.slice(0, INPUT_BUDGET_CHARS)
    : text;
}

function buildAugmentZod(schema: OutputSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of schema.fields) {
    if (f.type === "array") {
      shape[f.key] = z.array(z.string()).describe(f.label);
    } else {
      shape[f.key] = z.string().describe(f.label);
    }
  }
  return z.object(shape).passthrough();
}

export async function augmentThought(raw: string, schema: OutputSchema) {
  const zSchema = buildAugmentZod(schema);
  const compressed = await compressForModel(raw);
  const fieldHints = schema.fields
    .map((f) => {
      const opts = f.type === "array" && f.options ? ` (pick from: ${f.options.join(", ")})` : "";
      return `- ${f.key}: ${f.label}${opts}`;
    })
    .join("\n");

  const { object } = await generateObject({
    model,
    schema: zSchema,
    system:
      "You augment a user's raw 'thought' (a situational mantra or note-to-self) into structured fields. Follow each field label exactly. Only shorten a field when the field key or label explicitly asks for a shortened version. If a field asks for a refined, cleaned, or crisped version without shortening, preserve the full meaning and avoid compressing it. For arrays of categories, choose only from the supplied options.",
    prompt: `RAW THOUGHT:\n${compressed}\n\nFIELDS TO PRODUCE:\n${fieldHints}`,
  });
  return object as Record<string, unknown>;
}

type RankInput = {
  id: string;
  raw: string | null;
  augmented: Record<string, unknown> | null;
};

const rankSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().min(0).max(1),
        reason: z.string(),
      })
    )
    .max(3),
});

export type RankResult = z.infer<typeof rankSchema>["results"];

function thoughtToCorpus(t: RankInput) {
  const aug = t.augmented ? JSON.stringify(t.augmented) : "";
  const raw = t.raw ?? "";
  const rawPart =
    raw.length > CORPUS_ENTRY_CHARS
      ? `${raw.slice(0, CORPUS_ENTRY_CHARS)}…`
      : raw;
  return `ID:${t.id}\nRAW:${rawPart}\nAUGMENTED:${aug}`;
}

function fitCorpus(corpus: string): string {
  if (corpus.length <= CORPUS_TOTAL_CHARS) return corpus;
  return `${corpus.slice(0, CORPUS_TOTAL_CHARS)}…`;
}

export async function rankThoughts(query: string, thoughts: RankInput[]): Promise<RankResult> {
  if (thoughts.length === 0) return [];
  const corpus = thoughts.map(thoughtToCorpus).join("\n---\n");
  const fittedCorpus = fitCorpus(corpus);
  const { object } = await generateObject({
    model,
    schema: rankSchema,
    system:
      "You rank a user's saved 'thoughts' (situational mantras) by relevance to a query. Return up to 3 most relevant. Score 0..1. Use ONLY supplied IDs.",
    prompt: `QUERY: ${query}\n\nTHOUGHTS:\n${fittedCorpus}`,
  });
  return object.results;
}

const conflictSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["duplicate", "conflict"]),
      reason: z.string(),
    })
  ),
});

export type ConflictMatch = z.infer<typeof conflictSchema>["matches"];

export async function findConflicts(
  candidate: { raw: string; augmented: Record<string, unknown> },
  thoughts: RankInput[],
  customPrompt = DEFAULT_CONFLICT_PROMPT
): Promise<ConflictMatch> {
  if (thoughts.length === 0) return [];
  const corpus = thoughts.map(thoughtToCorpus).join("\n---\n");
  const candidateRaw =
    candidate.raw.length > INPUT_BUDGET_CHARS
      ? await compressForModel(candidate.raw)
      : candidate.raw;
  const { object } = await generateObject({
    model,
    schema: conflictSchema,
    system: `${customPrompt.trim() || DEFAULT_CONFLICT_PROMPT}

Hard rules: Given a CANDIDATE thought, find existing thoughts that are duplicates or conflicts. Empty array if none. Use ONLY supplied IDs. kind must be "duplicate" or "conflict".`,
    prompt: `CANDIDATE:\nRAW:${candidateRaw}\nAUGMENTED:${JSON.stringify(candidate.augmented)}\n\nEXISTING:\n${fitCorpus(corpus)}`,
  });
  return object.matches;
}

const categorySchema = z.object({
  thought_labels: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tags: z.array(z.string()).max(8),
    })
  ),
  categories: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(["existing", "new"]),
      thought_ids: z.array(z.string()),
      reason: z.string(),
    })
  ),
});

export type CategorizeResult = z.infer<typeof categorySchema>;

export async function categorizeThoughts(
  thoughts: RankInput[],
  existingCategories: string[]
): Promise<CategorizeResult> {
  if (thoughts.length === 0) return { thought_labels: [], categories: [] };
  if (existingCategories.length === 0) return { thought_labels: [], categories: [] };
  const corpus = thoughts.map(thoughtToCorpus).join("\n---\n");
  const fittedCorpus = fitCorpus(corpus);
  const { object } = await generateObject({
    model,
    schema: categorySchema,
    system:
      "Categorize saved thoughts. Create concise titles and tags for every thought. Assign each thought only to the user's allowed categories. Never create new category names. A thought can belong to multiple categories when useful. Use ONLY supplied IDs and ONLY supplied category names.",
    prompt: `ALLOWED CATEGORIES:\n${existingCategories.join(", ")}\n\nTHOUGHTS:\n${fittedCorpus}`,
  });
  return object;
}

const observationSchema = z.object({
  summary: z.string().min(1),
  main_points: z.array(z.string().min(1)).max(20),
  other_points: z.array(z.string().min(1)).max(20),
});

export async function extractAtomicObservations(raw: string, channel: string) {
  const compressed = await compressForModel(raw);
  const { object } = await generateObject({
    model,
    schema: observationSchema,
    system: `Summarize and structure the user's raw thought for the ${channel} channel. Return exactly two categories:

1. Main — Study Strategy Related
2. Other Points

VOICE PRESERVATION — CRITICAL:
- Preserve the user's original speaking style, wording, keywords, sentence flow, and vocabulary as much as possible. Their keywords are memory triggers.
- Do not heavily rephrase, polish, formalize, summarize away, or replace their words with cleaner AI-written language.
- You may remove obvious repetition, filler, and transcript noise, but every result must still sound like the user speaking.

OUTPUT FORMAT — SMALL PARAGRAPHS, NEVER RAW COPY:
- Do not return the original thought unchanged. Summarize it concisely and structurally.
- Produce a few small, readable paragraphs—not atomic points, bullet fragments, headings, or one giant paragraph.
- Each array item must be one complete small paragraph.
- When sentences form one reasoning chain, keep them together in one paragraph.
- Preserve chains such as problem → reasoning → implication → solution → next step.
- Keep the why, cause/effect, dependencies, sequence, comparison, conclusion, and intended action together when splitting would lose them.
- Prefer a wholesome complete reasoning paragraph over disconnected fragments. It must remain understandable months later without reopening the transcript.

CLASSIFICATION:
- main_points: concise structured paragraphs containing the central insights, reasoning, strategies, conclusions, or intended actions relevant to the ${channel} channel.
- For Study, this includes how the user should learn, finish courses, make notes, revise, memorize, recall, prepare for interviews or teaching, create connection notes, backtrack after gaps, validate knowledge, or automate the study/revision pipeline.
- For General, include every meaningful central insight/reasoning/strategy in main_points; do not mistakenly copy the full raw thought as one entry.
- other_points: surrounding observations/context such as AI industry changes, tools/courses, course creators, game development, unrelated projects, or meta-comments about recording thoughts.
- If context belongs to a larger chain whose main conclusion is relevant to ${channel}, keep the necessary context with that paragraph in main_points.

SUMMARY:
- summary must be one short line, using the user's own keywords and speaking style.

FINAL CHECK FOR EVERY OUTPUT:
- Did you preserve the user's own words and speaking style?
- Is enough surrounding reasoning retained for the thought to be complete?
- Can it later be compared with a future thought to identify conflicts or changes in thinking?
If not, merge back necessary surrounding sentences instead of shortening or rephrasing. Do not invent advice.`,
    prompt: `RAW THOUGHT:\n${compressed}`,
  });
  return {
    summary: object.summary.trim(),
    main_points: object.main_points.map((x) => x.trim()).filter(Boolean),
    other_points: object.other_points.map((x) => x.trim()).filter(Boolean),
  };
}

const ruleConflictSchema = z.object({
  conflicts: z.array(
    z.object({
      thought_point_index: z.number().int().nonnegative(),
      rule_id: z.string(),
      reason: z.string(),
    })
  ),
  non_conflicting_point_indexes: z.array(z.number().int().nonnegative()),
});

const observationAndConflictSchema = observationSchema.extend({
  conflicts: ruleConflictSchema.shape.conflicts,
  non_conflicting_point_indexes: ruleConflictSchema.shape.non_conflicting_point_indexes,
});

export async function extractAndCompareObservations(
  raw: string,
  channel: string,
  rules: { id: string; text: string }[]
) {
  const compressed = await compressForModel(raw);
  const { object } = await generateObject({
    model,
    schema: observationAndConflictSchema,
    system: `Summarize and structure the user's raw thought for the ${channel} channel, then compare its Main paragraphs with the latest RuleBook in the same response.

Return summary, main_points, other_points, conflicts, and non_conflicting_point_indexes.

VOICE AND STRUCTURE:
- Preserve the user's speaking style, wording, keywords, sentence flow, and vocabulary. Their keywords are memory triggers.
- Remove only obvious repetition, filler, and transcript noise. Do not polish into AI language or copy the raw thought unchanged.
- Produce a few concise, small, complete paragraphs. Keep each reasoning chain together: problem -> reasoning -> implication -> solution -> next step.
- summary is one short line in the user's own language and style.
- main_points contains central insights, reasoning, strategies, conclusions, and intended actions relevant to ${channel}.
- other_points contains surrounding or unrelated context. If context is necessary for a main reasoning chain, keep it in Main.

RULEBOOK COMPARISON:
- A conflict is mutually incompatible guidance or conclusions. Return every conflicting pair using only supplied rule IDs and zero-based Main paragraph indexes.
- Put only genuinely novel, non-conflicting complete Main paragraphs in non_conflicting_point_indexes.
- Omit duplicates, paraphrases, and paragraphs already fully covered by a rule; do not call them conflicts.
- If the RuleBook is empty, conflicts must be empty and every Main paragraph index must be non-conflicting.
- Never invent advice, rules, IDs, or indexes.`,
    prompt: `RAW THOUGHT:\n${compressed}\n\nLATEST RULEBOOK:\n${
      rules.length ? rules.map((rule) => `${rule.id}: ${rule.text}`).join("\n") : "(empty)"
    }`,
  });
  const mainPoints = object.main_points.map((x) => x.trim()).filter(Boolean);
  const validIndexes = new Set(mainPoints.map((_, index) => index));
  const validRuleIds = new Set(rules.map((rule) => rule.id));
  return {
    summary: object.summary.trim(),
    main_points: mainPoints,
    other_points: object.other_points.map((x) => x.trim()).filter(Boolean),
    conflicts: object.conflicts.filter(
      (item) => validIndexes.has(item.thought_point_index) && validRuleIds.has(item.rule_id)
    ),
    non_conflicting_point_indexes: rules.length === 0
      ? mainPoints.map((_, index) => index)
      : [...new Set(object.non_conflicting_point_indexes)].filter((index) => validIndexes.has(index)),
  };
}

export async function compareObservationsWithRulebook(
  observations: string[],
  rules: { id: string; text: string }[]
) {
  if (rules.length === 0) {
    return {
      conflicts: [],
      non_conflicting_point_indexes: observations.map((_, index) => index),
    };
  }
  const { object } = await generateObject({
    model,
    schema: ruleConflictSchema,
    system:
      "Compare new concise structured paragraphs with the latest RuleBook. Preserve the user's wording and reasoning chain. A conflict means mutually incompatible guidance or conclusions. Return every conflicting pair. Put only genuinely novel, non-conflicting complete paragraphs in non_conflicting_point_indexes. Omit duplicates, paraphrases, and paragraphs already fully covered by a rule; do not call them conflicts. Complementary or materially more specific reasoning may be novel. Use only supplied rule IDs and zero-based indexes.",
    prompt: `NEW OBSERVATIONS:\n${observations
      .map((text, index) => `${index}: ${text}`)
      .join("\n")}\n\nLATEST RULEBOOK:\n${rules
      .map((rule) => `${rule.id}: ${rule.text}`)
      .join("\n")}`,
  });
  const validIndexes = new Set(observations.map((_, index) => index));
  const validRuleIds = new Set(rules.map((rule) => rule.id));
  return {
    conflicts: object.conflicts.filter(
      (item) => validIndexes.has(item.thought_point_index) && validRuleIds.has(item.rule_id)
    ),
    non_conflicting_point_indexes: [...new Set(object.non_conflicting_point_indexes)].filter(
      (index) => validIndexes.has(index)
    ),
  };
}

export async function chatWithRulebook(
  question: string,
  rules: { number: number; text: string }[]
) {
  if (rules.length === 0) return "RuleBook is empty, so I cannot answer from it yet.";
  const { text } = await generateText({
    model,
    system:
      "Answer the user's doubt using only the supplied latest RuleBook. Be clear and practical. Cite supporting rules inline as [Rule N]. Never invent a rule. If the RuleBook does not contain enough guidance, say exactly what is missing and suggest recording a thought about it.",
    prompt: `QUESTION:\n${question}\n\nRULEBOOK:\n${rules.map((rule) => `Rule ${rule.number}: ${rule.text}`).join("\n")}`,
  });
  return text.trim();
}
