import { NextResponse } from "next/server";

import { createSessionCookie, verifyPassword } from "../../../../lib/portal-auth";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;
const PRIVATE_NO_STORE = "private, no-store";

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("cache-control", PRIVATE_NO_STORE);
  return response;
}

function safeDestination(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }

  const isLocalPath = (candidate: string) =>
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(candidate);

  return isLocalPath(value) && isLocalPath(decoded) ? value : "/";
}

export async function POST(request: Request): Promise<NextResponse> {
  const passwordHash = process.env.EMBE_PORTAL_PASSWORD_HASH;
  const sessionSecret = process.env.EMBE_PORTAL_SESSION_SECRET;

  if (!passwordHash || !sessionSecret) {
    return NextResponse.json(
      { error: "Authentication is unavailable" },
      { status: 503, headers: { "cache-control": PRIVATE_NO_STORE } }
    );
  }

  const form = await request.formData();
  const password = form.get("password");
  const destination = safeDestination(form.get("next"));
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const loopbackHost = new Set(["localhost", "127.0.0.1", "[::1]"]).has(requestUrl.hostname);

  if (typeof password !== "string" || !verifyPassword(password, passwordHash)) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("next", destination);
    return privateResponse(NextResponse.redirect(loginUrl, { status: 303 }));
  }

  const response = NextResponse.redirect(new URL(destination, origin), { status: 303 });
  response.cookies.set("embe_session", createSessionCookie(sessionSecret), {
    httpOnly: true,
    maxAge: SESSION_LIFETIME_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: requestUrl.protocol === "https:" || !loopbackHost
  });

  return privateResponse(response);
}
