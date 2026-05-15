import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "ct_auth";
const MAX_AGE_S = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing AUTH_SECRET");
  return new TextEncoder().encode(s);
}

export async function issueToken() {
  return await new SignJWT({ ok: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
}

export async function verifyToken(token: string | undefined) {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export const AUTH_COOKIE = COOKIE_NAME;
export const AUTH_MAX_AGE = MAX_AGE_S;
