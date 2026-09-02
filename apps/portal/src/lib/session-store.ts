import { readSessionCookie } from "./portal-auth";

type RpcResult = { data: unknown; error: boolean };
type SessionState = "active" | "revoked" | "unavailable";
type SessionCacheEntry = { expiresAt: number; state: Promise<SessionState> };
const SESSION_CACHE_MS = 5_000;
const sessionValidationCache = new Map<string, SessionCacheEntry>();
export const isSessionId = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function sessionRpc(name: string, body: Record<string, unknown>): Promise<RpcResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { data: null, error: true };
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(3000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) return { data: null, error: true };
    return { data: response.status === 204 ? null : await response.json(), error: false };
  } catch { return { data: null, error: true }; }
}

export function deviceName(request: Request): string {
  const agent = request.headers.get("user-agent") ?? "";
  if (/iphone/i.test(agent)) return /crios/i.test(agent) ? "Chrome trên iPhone" : "Safari trên iPhone";
  if (/ipad/i.test(agent)) return "Safari trên iPad";
  if (/android/i.test(agent)) return "Trình duyệt trên Android";
  if (/windows/i.test(agent)) return "Trình duyệt trên Windows";
  if (/macintosh|mac os/i.test(agent)) return "Trình duyệt trên Mac";
  return "Thiết bị đăng nhập";
}

export async function activeSession(id: string): Promise<boolean> {
  return await activeSessionState(id) === "active";
}

export async function activeSessionState(id: string): Promise<SessionState> {
  const now = Date.now();
  const cached = sessionValidationCache.get(id);
  if (cached && cached.expiresAt > now) return cached.state;
  if (cached) sessionValidationCache.delete(id);

  const state = sessionRpc("embe_verify_portal_session", { p_id: id }).then((result): SessionState => {
    if (result.error || typeof result.data !== "boolean") {
      sessionValidationCache.delete(id);
      return "unavailable";
    }
    return result.data ? "active" : "revoked";
  });
  sessionValidationCache.set(id, { expiresAt: now + SESSION_CACHE_MS, state });
  return state;
}

export function clearSessionValidationCache(id?: string): void {
  if (id) sessionValidationCache.delete(id);
  else sessionValidationCache.clear();
}

export async function activeRequestSession(request: Request): Promise<{ id: string; expiresAt: number } | null> {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const cookie = request.headers.get("cookie")?.split(";").map((item) => item.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  const parsed = secret ? readSessionCookie(cookie, secret) : null;
  return parsed && await activeSession(parsed.id) ? parsed : null;
}
