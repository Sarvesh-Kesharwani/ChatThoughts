import 'server-only';

import type { ThoughtCard, ThoughtSearchResult } from './thought-types';

interface DeepSeekMessage {
  role: 'system' | 'user';
  content: string;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function localScore(query: string, thought: ThoughtCard) {
  const queryTokens = new Set(tokenize(query));
  const thoughtTokens = tokenize(`${thought.needWhen} ${thought.mantra}`);
  if (!queryTokens.size || !thoughtTokens.length) return 0;
  const overlap = thoughtTokens.filter((token) => queryTokens.has(token)).length;
  return Math.round((overlap / Math.max(queryTokens.size, 1)) * 100);
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function callDeepSeekJson<T>(messages: DeepSeekMessage[]): Promise<T | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-flash',
      messages,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      stream: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`DeepSeek request failed: ${res.status} ${detail.slice(0, 240)}`);
  }

  const data = (await res.json()) as DeepSeekResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  return content ? parseJson<T>(content) : null;
}

export async function findDuplicateThoughts(candidate: Pick<ThoughtCard, 'needWhen' | 'mantra'>, thoughts: ThoughtCard[]) {
  if (!thoughts.length) return [];

  const payload = thoughts.slice(0, 200).map((thought) => ({
    id: thought.id,
    needWhen: thought.needWhen,
    mantra: thought.mantra,
  }));

  const ai = await callDeepSeekJson<{ conflicts: Array<{ id: string; reason: string }> }>([
    {
      role: 'system',
      content:
        'Return JSON only. Find existing thought cards that duplicate or conflict with the candidate. Include only genuine duplicates or contradictions.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        candidate,
        existingThoughts: payload,
        expectedShape: { conflicts: [{ id: 'thought id', reason: 'short reason' }] },
      }),
    },
  ]);

  if (ai?.conflicts?.length) {
    const ids = new Set(ai.conflicts.map((item) => item.id));
    return thoughts.filter((thought) => ids.has(thought.id)).slice(0, 5);
  }

  const candidateText = `${candidate.needWhen} ${candidate.mantra}`;
  return thoughts
    .map((thought) => ({ thought, score: localScore(candidateText, thought) }))
    .filter((item) => item.score >= 70)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.thought)
    .slice(0, 3);
}

export async function rankThoughts(query: string, thoughts: ThoughtCard[]): Promise<ThoughtSearchResult[]> {
  if (!thoughts.length) return [];

  const payload = thoughts.slice(0, 300).map((thought) => ({
    id: thought.id,
    needWhen: thought.needWhen,
    mantra: thought.mantra,
  }));

  const ai = await callDeepSeekJson<{ matches: Array<{ id: string; score: number; reason: string }> }>([
    {
      role: 'system',
      content:
        'Return JSON only. Pick the top 3 thought cards most relevant to the user issue. Do not create advice. Do not augment the mantra.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        query,
        thoughts: payload,
        expectedShape: { matches: [{ id: 'thought id', score: 0, reason: 'why this card matches' }] },
      }),
    },
  ]);

  if (ai?.matches?.length) {
    const byId = new Map(thoughts.map((thought) => [thought.id, thought]));
    return ai.matches
      .map((match) => {
        const thought = byId.get(match.id);
        return thought
          ? {
              thought,
              score: Number.isFinite(match.score) ? match.score : 0,
              reason: String(match.reason ?? '').slice(0, 180),
            }
          : null;
      })
      .filter((item): item is ThoughtSearchResult => Boolean(item))
      .slice(0, 3);
  }

  return thoughts
    .map((thought) => ({ thought, score: localScore(query, thought), reason: 'Keyword overlap match.' }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
