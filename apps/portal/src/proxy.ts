import { NextRequest, NextResponse } from "next/server";

import { readSessionCookie } from "./lib/portal-auth";
import { activeSessionState } from "./lib/session-store";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/passkey/options",
  "/api/auth/passkey/verify",
  "/api/health",
  "/offline",
  "/sw.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-icon.png",
  "/robots.txt"
]);
const PRIVATE_NO_STORE = "private, no-store";

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/chia-se/") || pathname.startsWith("/api/public/media/");
}

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("cache-control", PRIVATE_NO_STORE);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (process.env.VERCEL === "1" && request.nextUrl.hostname !== "embe.hieu.asia") {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "cache-control": PRIVATE_NO_STORE }
    });
  }

  if (isPublicPath(request.nextUrl.pathname)) {
    return privateResponse(NextResponse.next());
  }

  const sessionSecret = process.env.EMBE_PORTAL_SESSION_SECRET;

  if (!sessionSecret) {
    return new NextResponse("Authentication is unavailable", {
      status: 503,
      headers: { "cache-control": PRIVATE_NO_STORE }
    });
  }

  const session = request.cookies.get("embe_session")?.value;

  const parsed = readSessionCookie(session, sessionSecret);
  if (parsed) {
    const state = await activeSessionState(parsed.id);
    if (state === "active") return privateResponse(NextResponse.next());
    if (state === "unavailable") {
      return new NextResponse("Session validation is temporarily unavailable", {
        status: 503,
        headers: { "cache-control": PRIVATE_NO_STORE, "retry-after": "5" }
      });
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return privateResponse(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
