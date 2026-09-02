import { createHash } from "node:crypto";

import { generateAuthenticationOptions, generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { createPasskeyChallenge, hasExpectedOrigin, passkeyChallengeHash, passkeySite, validChallengeId } from "../../../../../lib/passkey";
import { passkeyList, passkeyStore } from "../../../../../lib/passkey-store";
import { checkLoginRate, loginRateKey, recordLoginFailure } from "../../../../../lib/login-rate-limit";
import { activeRequestSession } from "../../../../../lib/session-store";

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const site = passkeySite(request);
  if (!secret || !site) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  if (!hasExpectedOrigin(request, site.origin)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: PRIVATE_HEADERS });

  const body = await request.json().catch(() => null) as { purpose?: unknown } | null;
  const purpose = body?.purpose;
  if (purpose !== "login" && purpose !== "register") {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (purpose === "register" && !await activeRequestSession(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  }
  if (purpose === "login") {
    const rateKey = loginRateKey(request, secret, "passkey");
    const now = new Date();
    const current = await checkLoginRate(rateKey, now);
    if (current && !current.allowed) {
      return NextResponse.json({ error: "rate_limited" }, {
        status: 429,
        headers: { ...PRIVATE_HEADERS, "retry-after": String(current.retryAfterSeconds) }
      });
    }
    const recorded = await recordLoginFailure(rateKey, now);
    if (recorded && !recorded.allowed) {
      return NextResponse.json({ error: "rate_limited" }, {
        status: 429,
        headers: { ...PRIVATE_HEADERS, "retry-after": String(recorded.retryAfterSeconds) }
      });
    }
  }

  const store = passkeyStore();
  if (!store) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  const { data, error } = await store.rpc("embe_list_passkeys");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  const credentials = passkeyList(data);
  if (purpose === "login" && credentials.length === 0) {
    return NextResponse.json({ error: "not_configured" }, { status: 404, headers: PRIVATE_HEADERS });
  }

  const options = purpose === "register"
    ? await generateRegistrationOptions({
      rpName: "EmBe",
      rpID: site.rpID,
      userID: new Uint8Array(createHash("sha256").update(`family\0${secret}`).digest()),
      userName: "Gia đình EmBe",
      userDisplayName: "Gia đình EmBe",
      attestationType: "none",
      excludeCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      preferredAuthenticatorType: "localDevice"
    })
    : await generateAuthenticationOptions({
      rpID: site.rpID,
      userVerification: "required",
      allowCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports }))
    });

  const now = new Date();
  const created = await store.rpc("embe_create_passkey_challenge", {
    p_challenge_hash: passkeyChallengeHash(options.challenge, purpose),
    p_purpose: purpose,
    p_expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  });
  if (created.error || !validChallengeId(created.data)) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  }

  const response = NextResponse.json(options, { headers: PRIVATE_HEADERS });
  response.cookies.set("embe_passkey_challenge", createPasskeyChallenge(created.data, options.challenge, purpose, secret, now), {
    httpOnly: true, secure: site.origin.startsWith("https://"), sameSite: "strict", maxAge: 300,
    path: "/api/auth/passkey"
  });
  return response;
}
