import { requirePasscode } from '@/lib/passcode';
import { resolveConflict } from '@/lib/thoughts-repository';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await requirePasscode();
  if (blocked) return blocked;

  const { id } = await context.params;
  const payload = (await req.json().catch(() => ({}))) as { needWhen?: string; mantra?: string };

  try {
    return Response.json({
      conflict: await resolveConflict(id, {
        needWhen: payload.needWhen,
        mantra: payload.mantra,
      }),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to resolve conflict.' }, { status: 500 });
  }
}
