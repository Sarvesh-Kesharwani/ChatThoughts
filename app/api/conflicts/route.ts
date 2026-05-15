import { requirePasscode } from '@/lib/passcode';
import { listOpenConflicts } from '@/lib/thoughts-repository';

export async function GET() {
  const blocked = await requirePasscode();
  if (blocked) return blocked;

  try {
    return Response.json({ conflicts: await listOpenConflicts() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load conflicts.' }, { status: 500 });
  }
}
