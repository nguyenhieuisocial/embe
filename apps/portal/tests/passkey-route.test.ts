import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn()
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse
}));

import { POST as options } from "../src/app/api/auth/passkey/options/route";
import { POST as verify } from "../src/app/api/auth/passkey/verify/route";
import { DELETE as removeDevice, GET as listDevices } from "../src/app/api/auth/passkey/devices/route";

const originalEnvironment = { ...process.env };
const sessionId = "11111111-1111-4111-8111-111111111111";
const challengeId = "22222222-2222-4222-8222-222222222222";
const familyCookie = () => `embe_session=${createSessionCookie("server-secret", new Date(), sessionId)}`;

function jsonRequest(path: string, body: unknown, authenticated = false, extraHeaders: Record<string, string> = {}) {
  return new Request(`https://embe.hieu.asia${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://embe.hieu.asia",
      ...(authenticated ? { cookie: familyCookie() } : {}),
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
}

describe("passkey API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    mocks.rpc.mockReset();
    mocks.generateRegistrationOptions.mockReset();
    mocks.generateAuthenticationOptions.mockReset();
    mocks.verifyRegistrationResponse.mockReset();
    mocks.verifyAuthenticationResponse.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return Response.json(url.includes("login_rate_limit")
        ? { allowed: true, retry_after_seconds: 0 }
        : true);
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...originalEnvironment }; });

  it("requires the family session before creating a registration ceremony", async () => {
    const response = await options(jsonRequest("/api/auth/passkey/options", { purpose: "register" }));
    expect(response.status).toBe(401);
    expect(mocks.generateRegistrationOptions).not.toHaveBeenCalled();
  });

  it("creates short-lived registration options for Face ID without exposing family PII", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: challengeId, error: null });
    mocks.generateRegistrationOptions.mockResolvedValueOnce({ challenge: "register-challenge" });
    const response = await options(jsonRequest("/api/auth/passkey/options", { purpose: "register" }, true));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("embe_passkey_challenge=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "embe_create_passkey_challenge", expect.objectContaining({
      p_purpose: "register"
    }));
    expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: "embe.hieu.asia",
      userName: "Gia đình EmBe",
      userDisplayName: "Gia đình EmBe",
      attestationType: "none",
      authenticatorSelection: expect.objectContaining({ userVerification: "required" })
    }));
    const generated = mocks.generateRegistrationOptions.mock.calls[0][0];
    expect(Buffer.from(generated.userID).toString("utf8")).not.toContain("Hiếu");
    expect(Buffer.from(generated.userID).toString("utf8")).not.toContain("Ngân");
  });

  it("offers registered credentials for passkey login", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ credential_id: "credential-1", transports: ["internal"] }], error: null })
      .mockResolvedValueOnce({ data: challengeId, error: null });
    mocks.generateAuthenticationOptions.mockResolvedValueOnce({ challenge: "login-challenge" });
    const response = await options(jsonRequest("/api/auth/passkey/options", { purpose: "login" }));
    expect(response.status).toBe(200);
    expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: "embe.hieu.asia", userVerification: "required",
      allowCredentials: [{ id: "credential-1", transports: ["internal"] }]
    }));
  });

  it("rate-limits public passkey challenge creation before touching the challenge store", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ allowed: false, retry_after_seconds: 300 })));
    const response = await options(jsonRequest("/api/auth/passkey/options", { purpose: "login" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("verifies a registration and stores only the public credential", async () => {
    mocks.verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: "credential-1", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] },
        credentialDeviceType: "multiDevice", credentialBackedUp: true
      }
    });
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const challenge = await import("../src/lib/passkey").then(({ createPasskeyChallenge }) =>
      createPasskeyChallenge(challengeId, "register-challenge", "register", "server-secret")
    );
    const response = await verify(jsonRequest("/api/auth/passkey/verify", {
      purpose: "register", label: "iPhone của Mẹ Ngân", response: { id: "credential-1" }
    }, true, { cookie: `${familyCookie()}; embe_passkey_challenge=${challenge}` }));
    expect(response.status).toBe(200);
    expect(mocks.verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedChallenge: "register-challenge", expectedOrigin: "https://embe.hieu.asia",
      expectedRPID: "embe.hieu.asia", requireUserVerification: true
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "embe_consume_passkey_challenge", expect.objectContaining({
      p_id: challengeId, p_purpose: "register"
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "embe_save_passkey", expect.objectContaining({
      p_credential_id: "credential-1", p_public_key: "AQID", p_label: "iPhone của Mẹ Ngân"
    }));
  });

  it("logs in with a verified passkey and advances its replay counter", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { credential_id: "credential-1", public_key: "AQID", counter: 2, transports: ["internal"] }, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: sessionId, error: null });
    mocks.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 3 } });
    const challenge = await import("../src/lib/passkey").then(({ createPasskeyChallenge }) =>
      createPasskeyChallenge(challengeId, "login-challenge", "login", "server-secret")
    );
    const response = await verify(jsonRequest("/api/auth/passkey/verify", {
      purpose: "login", response: { id: "credential-1" }
    }, false, { cookie: `embe_passkey_challenge=${challenge}` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("embe_session=");
    expect(mocks.verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({
      credential: expect.objectContaining({ id: "credential-1", counter: 2 }),
      requireUserVerification: true
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "embe_consume_passkey_challenge", expect.objectContaining({ p_id: challengeId }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "embe_touch_passkey", {
      p_credential_id: "credential-1", p_expected_counter: 2, p_new_counter: 3
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(4, "embe_create_portal_session", expect.objectContaining({ p_auth_method: "passkey" }));
  });

  it("does not update a credential or create a session when a verified challenge was already consumed", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { credential_id: "credential-1", public_key: "AQID", counter: 0, transports: ["internal"] }, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    mocks.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 0 } });
    const challenge = await import("../src/lib/passkey").then(({ createPasskeyChallenge }) =>
      createPasskeyChallenge(challengeId, "login-challenge", "login", "server-secret")
    );

    const response = await verify(jsonRequest("/api/auth/passkey/verify", {
      purpose: "login", response: { id: "credential-1" }
    }, false, { cookie: `embe_passkey_challenge=${challenge}` }));

    expect(response.status).toBe(401);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("accepts a zero counter only after consuming its one-time challenge", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { credential_id: "credential-1", public_key: "AQID", counter: 0, transports: ["internal"] }, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: sessionId, error: null });
    mocks.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 0 } });
    const challenge = await import("../src/lib/passkey").then(({ createPasskeyChallenge }) =>
      createPasskeyChallenge(challengeId, "login-challenge", "login", "server-secret")
    );

    const response = await verify(jsonRequest("/api/auth/passkey/verify", {
      purpose: "login", response: { id: "credential-1" }
    }, false, { cookie: `embe_passkey_challenge=${challenge}` }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "embe_touch_passkey", {
      p_credential_id: "credential-1", p_expected_counter: 0, p_new_counter: 0
    });
  });

  it("lists and removes passkey devices only for an authenticated family session", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: "credential-1", label: "iPhone", created_at: "2026-09-02T00:00:00Z" }], error: null });
    const listed = await listDevices(new Request("https://embe.hieu.asia/api/auth/passkey/devices", { headers: { cookie: familyCookie() } }));
    expect(listed.status).toBe(200);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const removed = await removeDevice(new Request("https://embe.hieu.asia/api/auth/passkey/devices", {
      method: "DELETE", headers: { "content-type": "application/json", origin: "https://embe.hieu.asia", cookie: familyCookie() },
      body: JSON.stringify({ credentialId: "credential-1" })
    }));
    expect(removed.status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("embe_disable_passkey", { p_credential_id: "credential-1" });
  });
});
