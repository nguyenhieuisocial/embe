import { createHmac, timingSafeEqual } from "node:crypto";

export type PasskeyPurpose = "login" | "register";

type ChallengePayload = { challenge: string; expiresAt: number; purpose: PasskeyPurpose };

const CHALLENGE_LIFETIME_SECONDS = 5 * 60;

function signature(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`embe-passkey\0${value}`).digest();
}

export function createPasskeyChallenge(
  challenge: string,
  purpose: PasskeyPurpose,
  secret: string,
  now = new Date()
): string {
  const payload: ChallengePayload = {
    challenge,
    purpose,
    expiresAt: Math.floor(now.getTime() / 1000) + CHALLENGE_LIFETIME_SECONDS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function readPasskeyChallenge(
  token: string | undefined,
  purpose: PasskeyPurpose,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): string | null {
  if (!token || token.length > 2048) return null;
  const [encoded, suppliedSignature, ...extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra.length > 0) return null;

  let actual: Buffer;
  try {
    actual = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = signature(encoded, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ChallengePayload>;
    if (
      payload.purpose !== purpose ||
      typeof payload.challenge !== "string" ||
      !/^[A-Za-z0-9_-]{8,1024}$/.test(payload.challenge) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      Number(payload.expiresAt) <= nowSeconds
    ) return null;
    return payload.challenge;
  } catch {
    return null;
  }
}

export function cookieValue(request: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return request.headers.get("cookie")?.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

export function passkeySite(request: Request): { origin: string; rpID: string } | null {
  const url = new URL(request.url);
  if (url.hostname === "embe.hieu.asia" && url.protocol === "https:") {
    return { origin: "https://embe.hieu.asia", rpID: "embe.hieu.asia" };
  }
  if (new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)) {
    return { origin: url.origin, rpID: url.hostname.replace(/^\[|\]$/g, "") };
  }
  return null;
}

export function hasExpectedOrigin(request: Request, expectedOrigin: string): boolean {
  return request.headers.get("origin") === expectedOrigin;
}

export function validCredentialId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,1024}$/.test(value);
}

