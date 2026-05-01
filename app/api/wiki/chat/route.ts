import { getCookieBaseStore } from '@/lib/base-store';
import { rankInsights } from '@/lib/wiki-engine';

interface ChatResponsePayload {
  answer: string;
  references: Array<{
    insightId: string;
    thoughtId: string;
    problem: string;
    solution: string;
    sourceThought: string;
    score: number;
  }>;
}

async function callOpenAI(apiKey: string, query: string, context: ChatResponsePayload['references']) {
  const contextText = context
    .map(
      (ref, index) =>
        `[${index + 1}] Problem: ${ref.problem}\nSolution: ${ref.solution}\nSource thought: ${ref.sourceThought}\nThought ID: ${ref.thoughtId}`,
    )
    .join('\n\n');

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are a reasoning recall assistant. Answer using only provided note cards. If uncertain, say missing coverage and suggest what note to add.',
        },
        {
          role: 'user',
          content: `User question:\n${query}\n\nRelevant cards:\n${contextText}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LLM call failed: ${res.status} ${detail.slice(0, 250)}`);
  }

  const data = (await res.json()) as { output_text?: string };
  return data.output_text?.trim() || 'No answer generated.';
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as { query?: string; apiKey?: string };
  const query = String(payload.query ?? '').trim();
  const apiKey = String(payload.apiKey ?? '').trim();

  if (!query) {
    return Response.json({ error: 'Query is required' }, { status: 400 });
  }

  const store = await getCookieBaseStore();
  const ranked = rankInsights(query, store.insights);
  const references: ChatResponsePayload['references'] = ranked.map(({ insight, score }) => {
    const sourceThought = store.thoughts.find((thought) => thought.id === insight.thoughtId);
    return {
      insightId: insight.id,
      thoughtId: insight.thoughtId,
      problem: insight.problem,
      solution: insight.solution,
      sourceThought: sourceThought?.content ?? 'Source thought not found.',
      score,
    };
  });

  if (!apiKey) {
    return Response.json({
      answer: 'API key missing. I fetched relevant cards below. Add your key in Layer 3 to get AI reasoning answer.',
      references,
    } satisfies ChatResponsePayload);
  }

  try {
    const answer = await callOpenAI(apiKey, query, references);
    return Response.json({ answer, references } satisfies ChatResponsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LLM request failed.';
    return Response.json({ error: message }, { status: 502 });
  }
}
