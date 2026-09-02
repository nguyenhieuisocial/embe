import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { createSessionCookie } from "../../../../../lib/portal-auth";
import { cookieValue, hasExpectedOrigin, passkeyChallengeHash, passkeySite, readPasskeyChallenge, validCredentialId } from "../../../../../lib/passkey";
import { onePasskey, passkeyStore } from "../../../../../lib/passkey-store";
import { loginRateKey, resetLoginRate } from "../../../../../lib/login-rate-limit";
import { activeRequestSession, isSessionId } from "../../../../../lib/session-store";

const PRIVATE_HEADERS = { "cache-control": "private, no-store" };
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const site = passkeySite(request);
  if (!secret || !site) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  if (!hasExpectedOrigin(request, site.origin)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: PRIVATE_HEADERS });

  const body = await request.json().catch(() => null) as { purpose?: unknown; label?: unknown; response?: unknown } | null;
  const purpose = body?.purpose;
  if (purpose !== "login" && purpose !== "register") return NextResponse.json({ error: "invalid" }, { status: 400, headers: PRIVATE_HEADERS });
  if (purpose === "register" && !await activeRequestSession(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const challenge = readPasskeyChallenge(cookieValue(request, "embe_passkey_challenge"), purpose, secret);
  if (!challenge) return NextResponse.json({ error: "expired" }, { status: 400, headers: PRIVATE_HEADERS });

  const store = passkeyStore();
  if (!store) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  const ceremonyResponse = body?.response;
  const responseValue = ceremonyResponse as { id?: unknown } | null;
  if (!responseValue || !validCredentialId(responseValue.id)) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const result = NextResponse.json({ verified: true }, { headers: PRIVATE_HEADERS });
  result.cookies.set("embe_passkey_challenge", "", { httpOnly: true, secure: site.origin.startsWith("https://"), sameSite: "strict", maxAge: 0, path: "/api/auth/passkey" });

  try {
    if (purpose === "register") {
      const label = typeof body?.label === "string" ? body.label.trim() : "";
      if (label.length < 1 || label.length > 60) return NextResponse.json({ error: "invalid" }, { status: 400, headers: PRIVATE_HEADERS });
      const verified = await verifyRegistrationResponse({
        response: ceremonyResponse as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: site.origin,
        expectedRPID: site.rpID,
        requireUserVerification: true
      });
      if (!verified.verified) return NextResponse.json({ error: "invalid" }, { status: 401, headers: PRIVATE_HEADERS });
      const consumed = await store.rpc("embe_consume_passkey_challenge", {
        p_id: challenge.id,
        p_challenge_hash: passkeyChallengeHash(challenge.challenge, purpose),
        p_purpose: purpose
      });
      if (consumed.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
      if (consumed.data !== true) return NextResponse.json({ error: "invalid" }, { status: 401, headers: PRIVATE_HEADERS });
      const credential = verified.registrationInfo.credential;
      const { error } = await store.rpc("embe_save_passkey", {
        p_credential_id: credential.id,
        p_public_key: Buffer.from(credential.publicKey).toString("base64url"),
        p_counter: credential.counter,
        p_transports: credential.transports ?? [],
        p_label: label,
        p_device_type: verified.registrationInfo.credentialDeviceType,
        p_backed_up: verified.registrationInfo.credentialBackedUp
      });
      if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
      return result;
    }

    const { data, error } = await store.rpc("embe_get_passkey", { p_credential_id: responseValue.id });
    const stored = error ? null : onePasskey(data);
    if (!stored) return NextResponse.json({ error: "invalid" }, { status: 401, headers: PRIVATE_HEADERS });
    const verified = await verifyAuthenticationResponse({
      response: ceremonyResponse as AuthenticationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: site.origin,
      expectedRPID: site.rpID,
      credential: {
        id: stored.credential_id,
        publicKey: new Uint8Array(Buffer.from(stored.public_key, "base64url")),
        counter: stored.counter,
        transports: stored.transports
      },
      requireUserVerification: true
    });
    if (!verified.verified) return NextResponse.json({ error: "invalid" }, { status: 401, headers: PRIVATE_HEADERS });
    const consumed = await store.rpc("embe_consume_passkey_challenge", {
      p_id: challenge.id,
      p_challenge_hash: passkeyChallengeHash(challenge.challenge, purpose),
      p_purpose: purpose
    });
    if (consumed.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
    if (consumed.data !== true) return NextResponse.json({ error: "invalid" }, { status: 401, headers: PRIVATE_HEADERS });
    const touched = await store.rpc("embe_touch_passkey", {
      p_credential_id: stored.credential_id,
      p_expected_counter: stored.counter,
      p_new_counter: verified.authenticationInfo.newCounter
    });
    if (touched.error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
    const now = new Date();
    const session = await store.rpc("embe_create_portal_session", {
      p_device_name: stored.label ? `Face ID · ${stored.label}`.slice(0, 80) : "Face ID trên iPhone",
      p_auth_method: "passkey", p_expires_at: new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000).toISOString()
    });
    if (session.error || !isSessionId(session.data)) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
    result.cookies.set("embe_session", createSessionCookie(secret, now, session.data), {
      httpOnly: true, secure: site.origin.startsWith("https://"), sameSite: "lax",
      maxAge: SESSION_LIFETIME_SECONDS, path: "/"
    });
    await resetLoginRate(loginRateKey(request, secret, "passkey"));
    return result;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 401, headers: PRIVATE_HEADERS });
  }
}
