import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { verifySessionCookie } from "./portal-auth";
export { PHOTO_BUCKET, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "./photo-upload-contract";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

export function authorizeMutation(request: Request): 401 | 403 | null {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const session = cookieValue(request.headers.get("cookie"), "embe_session");
  if (!secret || !verifySessionCookie(session, secret)) return 401;

  const origin = request.headers.get("origin");
  if (!origin) return 403;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return 403;
  } catch {
    return 403;
  }
  return null;
}

export function privateReply(body: Record<string, unknown>, status: number, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", ...Object.fromEntries(new Headers(headers)) }
  });
}

export function photoStore(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return createClient(parsed.origin, key, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    });
  } catch {
    return null;
  }
}
