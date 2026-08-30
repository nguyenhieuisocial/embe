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

export function createSessionCookie(secret: string, now = new Date()): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + SESSION_LIFETIME_SECONDS;
  const signature = createHmac("sha256", secret).update(String(expiresAt)).digest("hex");

  return `${expiresAt}.${signature}`;
}

export function verifySessionCookie(
  cookie: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!cookie) {
    return false;
  }

  const [expiresText, signatureHex, ...extra] = cookie.split(".");
  const expiresAt = Number(expiresText);

  if (
    extra.length > 0 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= nowSeconds ||
    !/^[a-f0-9]{64}$/i.test(signatureHex ?? "")
  ) {
    return false;
  }

  const actual = Buffer.from(signatureHex, "hex");
  const expected = Buffer.from(
    createHmac("sha256", secret).update(String(expiresAt)).digest("hex"),
    "hex"
  );

  return safelyEqual(actual, expected);
}
