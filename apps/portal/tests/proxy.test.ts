import { createSessionCookie } from "../src/lib/portal-auth";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { proxy } from "../src/proxy";

const originalEnvironment = { ...process.env };

describe("portal access gate", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("redirects an unauthenticated visitor to the password page", () => {
    const response = proxy(new NextRequest("https://embe.hieu.asia/family?view=timeline"));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/family?view=timeline");
  });

  it("allows a visitor with an intact session", () => {
    const session = createSessionCookie("server-secret");
    const request = new NextRequest("https://embe.hieu.asia/", {
      headers: { cookie: `embe_session=${session}` }
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps the login endpoint public", () => {
    const response = proxy(new NextRequest("https://embe.hieu.asia/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/manifest.webmanifest", "/icon.svg", "/robots.txt"])(
    "keeps install and privacy metadata public: %s",
    (path) => {
      const response = proxy(new NextRequest(`https://embe.hieu.asia${path}`));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("fails closed when the session secret is unavailable", () => {
    delete process.env.EMBE_PORTAL_SESSION_SECRET;

    const response = proxy(new NextRequest("https://embe.hieu.asia/"));

    expect(response.status).toBe(503);
  });
});
