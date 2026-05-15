import { requirePasscode } from '@/lib/passcode';
import { addThoughtWithConflictCheck, listThoughts } from '@/lib/thoughts-repository';

export async function GET() {
  const blocked = await requirePasscode();
  if (blocked) return blocked;

  try {
    return Response.json({ thoughts: await listThoughts() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load thoughts.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const blocked = await requirePasscode();
  if (blocked) return blocked;

  const payload = (await req.json().catch(() => ({}))) as { needWhen?: string; mantra?: string };
  try {
    const result = await addThoughtWithConflictCheck({
      needWhen: payload.needWhen,
      mantra: payload.mantra,
    });
    return Response.json(result, { status: result.status === 'created' ? 201 : 409 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save thought.' }, { status: 500 });
  }
}
