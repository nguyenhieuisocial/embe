import { scryptSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../src/app/api/auth/login/route";

const originalEnvironment = { ...process.env };

function requestWith(password: string, next = "/"): Request {
  return new Request("https://embe.hieu.asia/api/auth/login", {
    body: new URLSearchParams({ password, next }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
}

describe("password login endpoint", () => {
  beforeEach(() => {
    const salt = "00112233445566778899aabbccddeeff";
    const hash = scryptSync("family-secret", salt, 64).toString("hex");
    process.env.EMBE_PORTAL_PASSWORD_HASH = `${salt}:${hash}`;
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("rejects an incorrect password without creating a session", async () => {
    const response = await POST(requestWith("wrong-secret"));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("creates a secure private session for the correct password", async () => {
    const response = await POST(requestWith("family-secret", "/?view=timeline"));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://embe.hieu.asia/?view=timeline");
    expect(cookie).toContain("embe_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("does not allow an external redirect after login", async () => {
    const response = await POST(requestWith("family-secret", "https://evil.example"));

    expect(response.headers.get("location")).toBe("https://embe.hieu.asia/");
  });

  it("fails closed when server secrets are unavailable", async () => {
    delete process.env.EMBE_PORTAL_SESSION_SECRET;

    const response = await POST(requestWith("family-secret"));

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
