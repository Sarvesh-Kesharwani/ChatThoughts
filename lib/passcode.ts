import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'chatthoughts_passcode';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getConfiguredPasscode() {
  return process.env.CHATTHOUGHTS_PASSCODE?.trim() ?? '';
}

function getSigningSecret() {
  return process.env.AUTH_SECRET?.trim() || process.env.CHATTHOUGHTS_PASSCODE?.trim() || 'chatthoughts-local';
}

function tokenFor(passcode: string) {
  return createHmac('sha256', getSigningSecret()).update(`chatthoughts:${passcode}`).digest('hex');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isPasscodeConfigured() {
  return Boolean(getConfiguredPasscode());
}

export function validatePasscode(passcode: string) {
  const configured = getConfiguredPasscode();
  return Boolean(configured) && safeEqual(passcode.trim(), configured);
}

export async function isPasscodeAccepted() {
  const configured = getConfiguredPasscode();
  if (!configured) return false;
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME)?.value ?? '';
  return Boolean(cookie) && safeEqual(cookie, tokenFor(configured));
}

export async function setPasscodeAcceptedCookie() {
  const configured = getConfiguredPasscode();
  const jar = await cookies();
  jar.set(COOKIE_NAME, tokenFor(configured), {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function requirePasscode() {
  if (!(await isPasscodeAccepted())) {
    return Response.json({ error: 'Passcode is required' }, { status: 401 });
  }
  return null;
}
