import type { InsightCard, ThoughtCard } from './base-types';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function splitToChunks(text: string): string[] {
  return text
    .split(/[.\n!?]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function createInsightsFromThought(thought: ThoughtCard): InsightCard[] {
  const chunks = splitToChunks(thought.content);
  const now = new Date().toISOString();

  return chunks.map((chunk, index) => {
    const tokens = tokenize(chunk);
    const tags = unique(tokens).slice(0, 6);
    const problem = chunk.length > 120 ? `${chunk.slice(0, 117)}...` : chunk;
    const solution = `Action: convert this into a concrete next step and test it against current work context.`;
    return {
      id: `insight_${thought.id}_${index + 1}`,
      thoughtId: thought.id,
      problem,
      solution,
      tags,
      createdAt: now,
    };
  });
}

export function buildInsightsForAllThoughts(thoughts: ThoughtCard[]): InsightCard[] {
  return thoughts.flatMap((thought) => createInsightsFromThought(thought));
}

export interface RankedInsight {
  insight: InsightCard;
  score: number;
}

export function rankInsights(query: string, insights: InsightCard[]): RankedInsight[] {
  const qTokens = tokenize(query);
  const qSet = new Set(qTokens);

  return insights
    .map((insight) => {
      const space = `${insight.problem} ${insight.solution} ${insight.tags.join(' ')}`;
      const tokens = tokenize(space);
      let overlap = 0;
      for (const token of tokens) {
        if (qSet.has(token)) overlap += 1;
      }
      const density = tokens.length ? overlap / tokens.length : 0;
      const tagBoost = insight.tags.reduce((acc, tag) => acc + (qSet.has(tag) ? 1 : 0), 0);
      const score = overlap + density * 5 + tagBoost * 1.5;
      return { insight, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
