import { createSessionCookie } from "../src/lib/portal-auth";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "../src/proxy";

const originalEnvironment = { ...process.env };

describe("portal access gate", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    process.env.VERCEL = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnvironment };
  });

  it("redirects an unauthenticated visitor to the password page", async () => {
    const response = await proxy(new NextRequest("https://embe.hieu.asia/family?view=timeline"));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/family?view=timeline");
  });

  it("allows only an intact, active server-side session", async () => {
    const session = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(true)));
    const request = new NextRequest("https://embe.hieu.asia/", {
      headers: { cookie: `embe_session=${session}` }
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps the login endpoint public", async () => {
    const response = await proxy(new NextRequest("https://embe.hieu.asia/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("blocks a signed cookie after its server-side session is revoked", async () => {
    const session = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(false)));
    const response = await proxy(new NextRequest("https://embe.hieu.asia/api/pregnancy", { headers: { cookie: `embe_session=${session}` } }));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("shows a temporary error instead of logging out when session validation is unavailable", async () => {
    const session = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("temporary outage"); }));
    const response = await proxy(new NextRequest("https://embe.hieu.asia/me-bau", { headers: { cookie: `embe_session=${session}` } }));
    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/temporarily unavailable/i);
  });

  it("keeps the content-free deployment health endpoint public", async () => {
    const response = await proxy(new NextRequest("https://embe.hieu.asia/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/chia-se/signed.token",
    "/api/public/media/signed.token"
  ])("allows only the temporary public share surfaces: %s", async (path) => {
    const response = await proxy(new NextRequest(`https://embe.hieu.asia${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not mistake a similar private path for a public share", async () => {
    const response = await proxy(new NextRequest("https://embe.hieu.asia/chia-se-gia/anything"));
    expect(response.status).toBe(307);
  });

  it("blocks the direct Vercel hostname from bypassing Cloudflare protection", async () => {
    const response = await proxy(new NextRequest("https://embe-portal.vercel.app/api/auth/login"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "/manifest.webmanifest",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-icon.png",
    "/robots.txt"
  ])(
    "keeps install and privacy metadata public: %s",
    async (path) => {
      const response = await proxy(new NextRequest(`https://embe.hieu.asia${path}`));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("fails closed when the session secret is unavailable", async () => {
    delete process.env.EMBE_PORTAL_SESSION_SECRET;

    const response = await proxy(new NextRequest("https://embe.hieu.asia/"));

    expect(response.status).toBe(503);
  });
});
