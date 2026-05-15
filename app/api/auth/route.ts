import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { issueToken, AUTH_COOKIE, AUTH_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { passcode } = (await req.json().catch(() => ({}))) as {
    passcode?: string;
  };
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  if (!passcode || passcode !== expected) {
    return NextResponse.json({ error: "invalid passcode" }, { status: 401 });
  }
  const token = await issueToken();
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
