import { NextRequest, NextResponse } from "next/server";

import { verifySessionCookie } from "./lib/portal-auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/manifest.webmanifest",
  "/icon.svg",
  "/robots.txt"
]);
const PRIVATE_NO_STORE = "private, no-store";

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("cache-control", PRIVATE_NO_STORE);
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
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
