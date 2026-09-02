import { NextResponse } from "next/server";
import { readSessionCookie } from "../../../../lib/portal-auth";
import { clearSessionValidationCache, sessionRpc } from "../../../../lib/session-store";

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const headers = { "cache-control": "private, no-store" };
  if (request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const cookie = request.headers.get("cookie")?.split(";").map((item) => item.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  const session = secret ? readSessionCookie(cookie, secret) : null;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  const revoked = await sessionRpc("embe_revoke_portal_sessions", {
    p_current_id: session.id, p_target_id: session.id, p_all: false
  });
  if (revoked.error || !Number.isInteger(revoked.data)) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  }
  clearSessionValidationCache(session.id);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303, headers });
  response.cookies.set("embe_session", "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: true
  });
  return response;
}
