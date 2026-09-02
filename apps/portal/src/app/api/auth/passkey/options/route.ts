import { createHash } from "node:crypto";

import { generateAuthenticationOptions, generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { verifySessionCookie } from "../../../../../lib/portal-auth";
import { cookieValue, createPasskeyChallenge, hasExpectedOrigin, passkeySite } from "../../../../../lib/passkey";
import { passkeyList, passkeyStore } from "../../../../../lib/passkey-store";

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
  if (purpose === "register" && !verifySessionCookie(cookieValue(request, "embe_session"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
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

  const response = NextResponse.json(options, { headers: PRIVATE_HEADERS });
  response.cookies.set("embe_passkey_challenge", createPasskeyChallenge(options.challenge, purpose, secret), {
    httpOnly: true, secure: site.origin.startsWith("https://"), sameSite: "strict", maxAge: 300,
    path: "/api/auth/passkey"
  });
  return response;
}
