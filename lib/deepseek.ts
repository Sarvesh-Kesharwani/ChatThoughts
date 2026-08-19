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
