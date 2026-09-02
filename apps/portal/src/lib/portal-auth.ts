import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

function safelyEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex, ...extra] = storedHash.split(":");

  if (!salt || !expectedHex || extra.length > 0 || !/^[a-f0-9]{128}$/i.test(expectedHex)) {
    return false;
  }

  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");

  return safelyEqual(actual, expected);
}

export function createSessionCookie(secret: string, now = new Date(), sessionId?: string): string {
  if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error("valid server-side session id required");
  }
  const expiresAt = Math.floor(now.getTime() / 1000) + SESSION_LIFETIME_SECONDS;
  const payload = `${sessionId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  return `${payload}.${signature}`;
}

export function readSessionCookie(cookie: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)):
  { id: string; expiresAt: number } | null {
  if (!cookie) return null;
  const [id, expiresText, signatureHex, ...extra] = cookie.split(".");
  const expiresAt = Number(expiresText);
  if (extra.length || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || !Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || !/^[a-f0-9]{64}$/i.test(signatureHex ?? "")) return null;
  const actual = Buffer.from(signatureHex, "hex");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${id}.${expiresAt}`).digest("hex"), "hex");
  return safelyEqual(actual, expected) ? { id, expiresAt } : null;
}

export function verifySessionCookie(
  cookie: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return readSessionCookie(cookie, secret, nowSeconds) !== null;
}
