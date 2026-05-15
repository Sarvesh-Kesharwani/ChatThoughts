import { requirePasscode } from '@/lib/passcode';
import { searchThoughts } from '@/lib/thoughts-repository';

export async function POST(req: Request) {
  const blocked = await requirePasscode();
  if (blocked) return blocked;

  const payload = (await req.json().catch(() => ({}))) as { query?: string };
  const query = String(payload.query ?? '').trim();

  if (!query) {
    return Response.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    return Response.json({ results: await searchThoughts(query) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed.';
    return Response.json({ error: message }, { status: 502 });
  }
}
