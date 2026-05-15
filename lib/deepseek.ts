import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateObject } from "ai";
import { z } from "zod";
import type { Thought } from "./supabase";

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! });
const model = deepseek("deepseek-chat");

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

export async function rankThoughts(
  query: string,
  thoughts: Pick<Thought, "id" | "when_needed" | "mantra">[]
): Promise<RankResult> {
  if (thoughts.length === 0) return [];
  const corpus = thoughts
    .map((t) => `ID:${t.id}\nWHEN:${t.when_needed}\nMANTRA:${t.mantra}`)
    .join("\n---\n");

  const { object } = await generateObject({
    model,
    schema: rankSchema,
    system:
      "You rank a user's saved 'thoughts' (situational mantras) by relevance to a user query. Return up to 3 most relevant. Score 0..1. Use ONLY supplied IDs.",
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
  candidate: { when_needed: string; mantra: string },
  thoughts: Pick<Thought, "id" | "when_needed" | "mantra">[]
): Promise<ConflictMatch> {
  if (thoughts.length === 0) return [];
  const corpus = thoughts
    .map((t) => `ID:${t.id}\nWHEN:${t.when_needed}\nMANTRA:${t.mantra}`)
    .join("\n---\n");

  const { object } = await generateObject({
    model,
    schema: conflictSchema,
    system:
      "Given a CANDIDATE thought (when_needed + mantra), find existing thoughts that are duplicates (near-identical purpose+advice) or conflicts (same situation, contradictory advice). Return empty array if none. Use ONLY supplied IDs.",
    prompt: `CANDIDATE:\nWHEN:${candidate.when_needed}\nMANTRA:${candidate.mantra}\n\nEXISTING:\n${corpus}`,
  });
  return object.matches;
}
