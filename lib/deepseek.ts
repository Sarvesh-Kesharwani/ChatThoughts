import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { z } from "zod";
import { DEFAULT_CONFLICT_PROMPT } from "@/lib/supabase";

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! });
const model = deepseek("deepseek-chat");

export type SchemaField = {
  key: string;
  label: string;
  type: "string" | "array";
  options?: string[];
};

export type OutputSchema = { fields: SchemaField[] };

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
      "You augment a user's raw 'thought' (a situational mantra or note-to-self) into structured fields. Be concise. For arrays of categories, choose only from the supplied options.",
    prompt: `RAW THOUGHT:\n${raw}\n\nFIELDS TO PRODUCE:\n${fieldHints}`,
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
  return `ID:${t.id}\nRAW:${t.raw ?? ""}\nAUGMENTED:${aug}`;
}

export async function rankThoughts(query: string, thoughts: RankInput[]): Promise<RankResult> {
  if (thoughts.length === 0) return [];
  const corpus = thoughts.map(thoughtToCorpus).join("\n---\n");
  const { object } = await generateObject({
    model,
    schema: rankSchema,
    system:
      "You rank a user's saved 'thoughts' (situational mantras) by relevance to a query. Return up to 3 most relevant. Score 0..1. Use ONLY supplied IDs.",
    prompt: `QUERY: ${query}\n\nTHOUGHTS:\n${corpus}`,
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
  const { object } = await generateObject({
    model,
    schema: conflictSchema,
    system: `${customPrompt.trim() || DEFAULT_CONFLICT_PROMPT}

Hard rules: Given a CANDIDATE thought, find existing thoughts that are duplicates or conflicts. Empty array if none. Use ONLY supplied IDs. kind must be "duplicate" or "conflict".`,
    prompt: `CANDIDATE:\nRAW:${candidate.raw}\nAUGMENTED:${JSON.stringify(candidate.augmented)}\n\nEXISTING:\n${corpus}`,
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
  const corpus = thoughts.map(thoughtToCorpus).join("\n---\n");
  const { object } = await generateObject({
    model,
    schema: categorySchema,
    system:
      "Categorize saved thoughts. Create concise titles and tags for every thought. Use existing categories when they fit, and add new categories when needed. A thought can belong to multiple categories. Use ONLY supplied IDs.",
    prompt: `EXISTING CATEGORIES:\n${existingCategories.length ? existingCategories.join(", ") : "none"}\n\nTHOUGHTS:\n${corpus}`,
  });
  return object;
}
