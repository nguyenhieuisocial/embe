import { readSessionCookie } from "./portal-auth";
import { activeSessionState } from "./session-store";
import { authorizeMutation, privateReply } from "./photo-upload-server";

export async function memberAuthorization(request: Request, mutation = false): Promise<Response | null> {
  if (mutation) {
    const denied = authorizeMutation(request);
    if (denied) return privateReply({ error: denied === 401 ? "unauthorized" : "forbidden" }, denied);
  }
  const cookie = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("embe_session="))?.slice(13);
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const parsed = secret ? readSessionCookie(cookie, secret) : null;
  if (!parsed) return privateReply({ error: "unauthorized" }, 401);
  const state = await activeSessionState(parsed.id);
  return state === "active" ? null : privateReply({ error: state === "revoked" ? "unauthorized" : "temporarily_unavailable" }, state === "revoked" ? 401 : 503);
}

export async function memberBody(request: Request, limit = 64 * 1024): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("invalid_request");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 96 * 1024) throw new Error("invalid_limit");
  if (Number(request.headers.get("content-length")) > limit) throw new Error("too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0; let body = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("too_large"); }
      body += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { reader.releaseLock(); }
}

type RpcName = "embe_list_family_members" | "embe_save_family_member" | "embe_list_member_records" | "embe_save_member_record" | "embe_member_change_history" | "embe_list_pregnancy_memories";
export async function memberRpc(name: RpcName, body: Record<string, unknown> = {}): Promise<{ data: unknown; status: number }> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return { data: null, status: 503 };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok) return { data, status: 200 };
    const code = data?.code;
    return { data: null, status: ["40001", "23505"].includes(code) ? 409 : code === "P0002" ? 404 : ["22023", "22007", "22008", "23514"].includes(code) ? 400 : 503 };
  } catch { return { data: null, status: 503 }; }
}
export function memberFailure(status: number): Response {
  return privateReply({ error: status === 409 ? "revision_conflict" : status === 404 ? "not_found" : status === 400 ? "invalid_request" : "temporarily_unavailable" }, status);
}
