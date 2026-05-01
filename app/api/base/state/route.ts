import { getCookieBaseStore, markCookieStoreDirty, setCookieBaseStore } from '@/lib/base-store';
import { buildInsightsForAllThoughts, createInsightsFromThought } from '@/lib/wiki-engine';

export async function GET() {
  const store = await getCookieBaseStore();
  return Response.json(store);
}

export async function POST(req: Request) {
  const patch = (await req.json().catch(() => ({}))) as
    | { action?: 'add_thought'; content?: string }
    | { action?: 'rebuild_insights' }
    | { thoughts?: Array<{ id: string; content: string; createdAt: string }>; insights?: unknown[] };
  const current = await getCookieBaseStore();
  let next = current;

  if ('action' in patch && patch.action === 'add_thought') {
    const content = String(patch.content ?? '').trim().slice(0, 2000);
    if (!content) {
      return Response.json({ error: 'Thought content is required' }, { status: 400 });
    }

    const thoughtId = `thought_${Date.now()}`;
    const thought = {
      id: thoughtId,
      content,
      createdAt: new Date().toISOString(),
    };

    const newInsights = createInsightsFromThought(thought);
    next = {
      thoughts: [...current.thoughts, thought].slice(-300),
      insights: [...current.insights, ...newInsights].slice(-1200),
    };
  } else if ('action' in patch && patch.action === 'rebuild_insights') {
    next = {
      thoughts: current.thoughts,
      insights: buildInsightsForAllThoughts(current.thoughts).slice(-1200),
    };
  } else {
    next = {
      thoughts: Array.isArray((patch as { thoughts?: unknown[] }).thoughts)
        ? ((patch as { thoughts: Array<{ id: string; content: string; createdAt: string }> }).thoughts ?? [])
        : current.thoughts,
      insights: Array.isArray((patch as { insights?: unknown[] }).insights)
        ? (patch as { insights: typeof current.insights }).insights
        : current.insights,
    };
  }

  await setCookieBaseStore(next);
  await markCookieStoreDirty();
  return Response.json(next);
}
