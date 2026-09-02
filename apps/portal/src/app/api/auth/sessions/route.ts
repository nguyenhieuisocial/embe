import { NextResponse } from "next/server";

import { readSessionCookie } from "../../../../lib/portal-auth";
import { activeSession, isSessionId, sessionRpc } from "../../../../lib/session-store";

const HEADERS = { "cache-control": "private, no-store" };
function current(request: Request) {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const cookie = request.headers.get("cookie")?.split(";").map((item) => item.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  return secret ? readSessionCookie(cookie, secret) : null;
}
export async function GET(request: Request) {
  const session = current(request);
  if (!session || !await activeSession(session.id)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: HEADERS });
  const result = await sessionRpc("embe_list_portal_sessions", { p_current_id: session.id });
  if (result.error || !Array.isArray(result.data)) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  const sessions = result.data.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (!isSessionId(row.id) || typeof row.device_name !== "string" || !["password", "passkey"].includes(String(row.auth_method))
        || typeof row.created_at !== "string" || typeof row.last_seen_at !== "string" || typeof row.current !== "boolean") return [];
    return [{ id: row.id, deviceName: row.device_name, authMethod: row.auth_method,
      createdAt: row.created_at, lastSeenAt: row.last_seen_at, current: row.current }];
  });
  if (sessions.length !== result.data.length) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  return NextResponse.json({ sessions }, { headers: HEADERS });
}

export async function DELETE(request: Request) {
  const session = current(request);
  if (!session || !await activeSession(session.id)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: HEADERS });
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: HEADERS });
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 512) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 512) return NextResponse.json({ error: "too_large" }, { status: 413, headers: HEADERS });
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } })();
  const all = body && Object.keys(body).length === 1 && body.action === "all";
  const one = body && Object.keys(body).length === 2 && body.action === "one" && isSessionId(body.id);
  if (!all && !one) return NextResponse.json({ error: "invalid" }, { status: 400, headers: HEADERS });
  const target = one ? body.id as string : null;
  const result = await sessionRpc("embe_revoke_portal_sessions", { p_current_id: session.id, p_target_id: target, p_all: Boolean(all) });
  if (result.error || !Number.isInteger(result.data)) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  const response = NextResponse.json({ revoked: result.data }, { headers: HEADERS });
  if (all || target === session.id) response.cookies.set("embe_session", "", {
    expires: new Date(0), httpOnly: true, maxAge: 0, path: "/", sameSite: "lax", secure: url.protocol === "https:"
  });
  return response;
}
