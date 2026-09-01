import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PART = /^[A-Za-z0-9_-]+$/;
export const MEDIA_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type MediaSharePayload = { v: 1; k: "media"; id: string; exp: number };

function secret(): string | null {
  const value = process.env.EMBE_PORTAL_SESSION_SECRET;
  return value && value.length >= 12 ? value : null;
}

function signature(payload: string, key: string): Buffer {
  return createHmac("sha256", key).update("embe-media-share-v1\0").update(payload).digest();
}

export function createMediaShareToken(id: string, now = new Date()): string {
  const key = secret();
  if (!key || !UUID.test(id)) throw new Error("Sharing is unavailable");
  const payload: MediaSharePayload = {
    v: 1,
    k: "media",
    id,
    exp: now.getTime() + MEDIA_SHARE_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, key).toString("base64url")}`;
}

export function verifyMediaShareToken(token: string, now = new Date()): { id: string } | null {
  const key = secret();
  if (!key || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => !part || !TOKEN_PART.test(part))) return null;
  const [encoded, supplied] = parts;
  const expected = signature(encoded, key);
  const suppliedBytes = Buffer.from(supplied, "base64url");
  if (suppliedBytes.toString("base64url") !== supplied || suppliedBytes.length !== expected.length || !timingSafeEqual(suppliedBytes, expected)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const payload = value as Partial<MediaSharePayload>;
    if (payload.v !== 1 || payload.k !== "media" || typeof payload.id !== "string" || !UUID.test(payload.id) ||
        !Number.isSafeInteger(payload.exp) || Number(payload.exp) <= now.getTime()) return null;
    return { id: payload.id };
  } catch {
    return null;
  }
}
