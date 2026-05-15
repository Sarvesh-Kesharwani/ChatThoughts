import { isPasscodeConfigured, setPasscodeAcceptedCookie, validatePasscode } from '@/lib/passcode';

export async function POST(req: Request) {
  if (!isPasscodeConfigured()) {
    return Response.json({ error: 'CHATTHOUGHTS_PASSCODE is not configured.' }, { status: 500 });
  }

  const payload = (await req.json().catch(() => ({}))) as { passcode?: string };
  if (!validatePasscode(String(payload.passcode ?? ''))) {
    return Response.json({ error: 'Invalid passcode.' }, { status: 401 });
  }

  await setPasscodeAcceptedCookie();
  return Response.json({ ok: true });
}
