import { NextResponse } from "next/server";

import { createSessionCookie, verifyPassword } from "../../../../lib/portal-auth";
import { checkLoginRate, loginRateKey, recordLoginFailure, resetLoginRate } from "../../../../lib/login-rate-limit";
import { deviceName, isSessionId, sessionRpc } from "../../../../lib/session-store";

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

function failedLogin(origin: string, destination: string, retryAfterSeconds = 0): NextResponse {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "1");
  loginUrl.searchParams.set("next", destination);
  const response = NextResponse.redirect(loginUrl, { status: 303 });
  if (retryAfterSeconds > 0) response.headers.set("retry-after", String(retryAfterSeconds));
  return privateResponse(response);
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
  const rateKey = loginRateKey(request, sessionSecret);
  const now = new Date();
  const currentRate = await checkLoginRate(rateKey, now);

  if (currentRate && !currentRate.allowed) {
    return failedLogin(origin, destination, currentRate.retryAfterSeconds);
  }

  if (typeof password !== "string" || !verifyPassword(password, passwordHash)) {
    const failedRate = await recordLoginFailure(rateKey, now);
    return failedLogin(origin, destination, failedRate?.retryAfterSeconds ?? 0);
  }

  await resetLoginRate(rateKey);

  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000);
  const created = await sessionRpc("embe_create_portal_session", {
    p_device_name: deviceName(request), p_auth_method: "password", p_expires_at: expiresAt.toISOString()
  });
  if (created.error || !isSessionId(created.data)) {
    return NextResponse.json({ error: "Authentication is unavailable" }, { status: 503, headers: { "cache-control": PRIVATE_NO_STORE } });
  }

  const response = NextResponse.redirect(new URL(destination, origin), { status: 303 });
  response.cookies.set("embe_session", createSessionCookie(sessionSecret, now, created.data), {
    httpOnly: true,
    maxAge: SESSION_LIFETIME_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: requestUrl.protocol === "https:" || !loopbackHost
  });

  return privateResponse(response);
}
