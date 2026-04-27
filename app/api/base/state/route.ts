import { getCookieBaseStore, markCookieStoreDirty, setCookieBaseStore } from '@/lib/base-store';

export async function GET() {
  const store = await getCookieBaseStore();
  return Response.json(store);
}

export async function POST(req: Request) {
  const patch = (await req.json().catch(() => ({}))) as { sampleCounter?: number; lastNote?: string };
  const current = await getCookieBaseStore();
  const next = {
    sampleCounter: Number.isFinite(patch.sampleCounter) ? Number(patch.sampleCounter) : current.sampleCounter,
    lastNote: typeof patch.lastNote === 'string' ? patch.lastNote.slice(0, 240) : current.lastNote,
  };

  await setCookieBaseStore(next);
  await markCookieStoreDirty();
  return Response.json(next);
}
