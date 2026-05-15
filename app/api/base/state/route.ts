import { getCookieBaseStore, markCookieStoreDirty, setCookieBaseStore } from '@/lib/base-store';
import { DEFAULT_FEATURE_REQUEST_CATEGORIES } from '@/lib/constants';
import { buildInsightsForAllThoughts, createInsightsFromThought } from '@/lib/wiki-engine';

export async function GET() {
  const store = await getCookieBaseStore();
  return Response.json(store);
}

export async function POST(req: Request) {
  const patch = (await req.json().catch(() => ({}))) as
    | { action?: 'add_thought'; content?: string }
    | { action?: 'rebuild_insights' }
    | { action?: 'add_feature_request'; description?: string; category?: string }
    | { action?: 'add_feature_category'; category?: string }
    | { action?: 'toggle_feature_request'; id?: string; complete?: boolean }
    | { action?: 'move_feature_request'; id?: string; category?: string }
    | { action?: 'delete_feature_request'; id?: string }
    | {
        thoughts?: Array<{ id: string; content: string; createdAt: string }>;
        insights?: unknown[];
        featureRequestCategories?: unknown[];
        featureRequests?: unknown[];
      };
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
      featureRequestCategories: Array.isArray((patch as { featureRequestCategories?: unknown[] }).featureRequestCategories)
        ? (patch as { featureRequestCategories: string[] }).featureRequestCategories
        : current.featureRequestCategories,
      featureRequests: current.featureRequests,
    };
  } else if ('action' in patch && patch.action === 'rebuild_insights') {
    next = {
      thoughts: current.thoughts,
      insights: buildInsightsForAllThoughts(current.thoughts).slice(-1200),
      featureRequestCategories: current.featureRequestCategories,
      featureRequests: current.featureRequests,
    };
  } else if ('action' in patch && patch.action === 'add_feature_request') {
    const description = String(patch.description ?? '').trim().slice(0, 500);
    if (!description) {
      return Response.json({ error: 'Request description is required' }, { status: 400 });
    }

    const category = String(patch.category ?? DEFAULT_FEATURE_REQUEST_CATEGORIES[0]).trim().toLowerCase();
    const featureRequestCategories = current.featureRequestCategories.includes(category)
      ? current.featureRequestCategories
      : [...current.featureRequestCategories, category].slice(0, 20);

    next = {
      ...current,
      featureRequestCategories,
      featureRequests: [
        {
          id: `request_${Date.now()}`,
          description,
          complete: false,
          category: featureRequestCategories.includes(category) ? category : DEFAULT_FEATURE_REQUEST_CATEGORIES[0],
          createdAt: new Date().toISOString(),
        },
        ...current.featureRequests,
      ].slice(0, 200),
    };
  } else if ('action' in patch && patch.action === 'add_feature_category') {
    const category = String(patch.category ?? '').trim().toLowerCase().slice(0, 40);
    if (!category) {
      return Response.json({ error: 'Category is required' }, { status: 400 });
    }

    next = {
      ...current,
      featureRequestCategories: current.featureRequestCategories.includes(category)
        ? current.featureRequestCategories
        : [...current.featureRequestCategories, category].slice(0, 20),
    };
  } else if ('action' in patch && patch.action === 'toggle_feature_request') {
    const id = String(patch.id ?? '');
    next = {
      ...current,
      featureRequests: current.featureRequests.map((item) =>
        item.id === id ? { ...item, complete: Boolean(patch.complete) } : item,
      ),
    };
  } else if ('action' in patch && patch.action === 'move_feature_request') {
    const id = String(patch.id ?? '');
    const category = String(patch.category ?? DEFAULT_FEATURE_REQUEST_CATEGORIES[0]).trim().toLowerCase();
    const featureRequestCategories = current.featureRequestCategories.includes(category)
      ? current.featureRequestCategories
      : [...current.featureRequestCategories, category].slice(0, 20);

    next = {
      ...current,
      featureRequestCategories,
      featureRequests: current.featureRequests.map((item) => (item.id === id ? { ...item, category } : item)),
    };
  } else if ('action' in patch && patch.action === 'delete_feature_request') {
    const id = String(patch.id ?? '');
    next = {
      ...current,
      featureRequests: current.featureRequests.filter((item) => item.id !== id),
    };
  } else {
    next = {
      thoughts: Array.isArray((patch as { thoughts?: unknown[] }).thoughts)
        ? ((patch as { thoughts: Array<{ id: string; content: string; createdAt: string }> }).thoughts ?? [])
        : current.thoughts,
      insights: Array.isArray((patch as { insights?: unknown[] }).insights)
        ? (patch as { insights: typeof current.insights }).insights
        : current.insights,
      featureRequestCategories: current.featureRequestCategories,
      featureRequests: Array.isArray((patch as { featureRequests?: unknown[] }).featureRequests)
        ? (patch as { featureRequests: typeof current.featureRequests }).featureRequests
        : current.featureRequests,
    };
  }

  await setCookieBaseStore(next);
  await markCookieStoreDirty();
  return Response.json(next);
}
