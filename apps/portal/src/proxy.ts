import { NextRequest, NextResponse } from "next/server";

import { verifySessionCookie } from "./lib/portal-auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
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

export function proxy(request: NextRequest): NextResponse {
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

  if (verifySessionCookie(session, sessionSecret)) {
    return privateResponse(NextResponse.next());
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return privateResponse(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
