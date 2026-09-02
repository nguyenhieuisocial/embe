import { createHmac, scryptSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/auth/login/route";

const originalEnvironment = { ...process.env };
const sessionId = "11111111-1111-4111-8111-111111111111";

function requestWith(password: string, next = "/", headers: Record<string, string> = {}): Request {
  return new Request("https://embe.hieu.asia/api/auth/login", {
    body: new URLSearchParams({ password, next }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    method: "POST"
  });
}

describe("password login endpoint", () => {
  beforeEach(() => {
    const salt = "00112233445566778899aabbccddeeff";
    const hash = scryptSync("family-secret", salt, 64).toString("hex");
    process.env.EMBE_PORTAL_PASSWORD_HASH = `${salt}:${hash}`;
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const name = String(input).split("/").pop();
      return name === "embe_check_login_rate_limit" ? Response.json({ allowed: true, retry_after_seconds: 0 })
        : name === "embe_create_portal_session" ? Response.json(sessionId) : new Response(null, { status: 204 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnvironment };
  });

  it("rejects an incorrect password without creating a session", async () => {
    const response = await POST(requestWith("wrong-secret"));

    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("creates a secure private session for the correct password", async () => {
    const response = await POST(requestWith("family-secret", "/?view=timeline"));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBe("https://embe.hieu.asia/?view=timeline");
    expect(cookie).toContain("embe_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("keys failures by an HMAC of the trusted Vercel IP and ignores spoofed forwarding headers", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return String(input).endsWith("embe_check_login_rate_limit")
        ? Response.json({ allowed: true, retry_after_seconds: 0 })
        : Response.json({ allowed: true, retry_after_seconds: 0 });
    }));
    process.env.VERCEL = "1";

    await POST(requestWith("wrong-secret", "/", {
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99",
      "cf-connecting-ip": "192.0.2.44"
    }));

    const expected = createHmac("sha256", "server-secret")
      .update("login-ip\0" + "203.0.113.7").digest("hex");
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.p_key_hash === expected)).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("203.0.113.7");
    expect(JSON.stringify(calls)).not.toContain("198.51.100.99");
  });

  it("uses Cloudflare's connecting IP only when that proxy is explicitly trusted", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return String(input).endsWith("embe_check_login_rate_limit")
        ? Response.json({ allowed: true, retry_after_seconds: 0 })
        : Response.json({ allowed: true, retry_after_seconds: 0 });
    }));
    process.env.VERCEL = "1";
    process.env.EMBE_TRUST_CLOUDFLARE_PROXY = "1";

    await POST(requestWith("wrong-secret", "/", {
      "cf-connecting-ip": "192.0.2.44",
      "x-vercel-forwarded-for": "203.0.113.9"
    }));

    const expected = createHmac("sha256", "server-secret")
      .update("login-ip\0" + "192.0.2.44").digest("hex");
    expect(calls.every((call) => call.p_key_hash === expected)).toBe(true);
  });

  it("honors an active backoff without revealing whether the password was right", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ allowed: false, retry_after_seconds: 60 })));
    process.env.VERCEL = "1";
    const response = await POST(requestWith("family-secret", "/", {
      "x-vercel-forwarded-for": "203.0.113.8"
    }));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("1");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("resets the limiter after a correct password", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return String(input).endsWith("embe_check_login_rate_limit") ? Response.json({ allowed: true, retry_after_seconds: 0 })
        : String(input).endsWith("embe_create_portal_session") ? Response.json(sessionId) : new Response(null, { status: 204 });
    }));

    const response = await POST(requestWith("family-secret"));

    expect(response.headers.get("set-cookie")).toContain("embe_session=");
    expect(urls.some((url) => url.endsWith("/rpc/embe_reset_login_rate_limit"))).toBe(true);
  });

  it("fails closed when the server-side session registry is unavailable", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(requestWith("family-secret"));

    expect(fetchMock).toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("allows the same private session on loopback HTTP for local visual verification", async () => {
    const request = new Request("http://127.0.0.1:3010/api/auth/login", {
      body: new URLSearchParams({ password: "family-secret", next: "/huong-dan" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    });
    const response = await POST(request);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.headers.get("location")).toBe("http://127.0.0.1:3010/huong-dan");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
  });

  it("does not allow an external redirect after login", async () => {
    const response = await POST(requestWith("family-secret", "https://evil.example"));

    expect(response.headers.get("location")).toBe("https://embe.hieu.asia/");
  });

  it.each([
    "/\\\\evil.example",
    "/%5C%5Cevil.example",
    "/journal\r\nLocation: https://evil.example",
    "/journal%0D%0ALocation:https://evil.example",
    "/journal\u0000hidden"
  ])("rejects an unsafe local-looking redirect: %j", async (destination) => {
    const response = await POST(requestWith("family-secret", destination));

    expect(response.headers.get("location")).toBe("https://embe.hieu.asia/");
  });

  it("fails closed when server secrets are unavailable", async () => {
    delete process.env.EMBE_PORTAL_SESSION_SECRET;

    const response = await POST(requestWith("family-secret"));

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
