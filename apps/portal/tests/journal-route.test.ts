import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/journal/route";

const originalEnvironment = { ...process.env };

function requestWith(body: unknown, cookie?: string, origin = "https://embe.hieu.asia"): Request {
  return new Request("https://embe.hieu.asia/api/journal", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie: `embe_session=${cookie}` } : {})
    },
    method: "POST"
  });
}

describe("mobile journal endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify("11111111-1111-4111-8111-111111111111"), { status: 200 })
    ));
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects a direct request without an intact portal session", async () => {
    const response = await POST(requestWith({ content: "Một ngày vui", authorRole: "father" }));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates short text, role and idempotency key before storage", async () => {
    const cookie = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    const response = await POST(requestWith({
      content: "  ",
      authorRole: "admin",
      idempotencyKey: "not-a-uuid"
    }, cookie));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin before storage", async () => {
    const cookie = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    const response = await POST(requestWith({
      content: "Một ngày vui",
      authorRole: "father",
      idempotencyKey: "11111111-1111-4111-8111-111111111111"
    }, cookie, "https://attacker.example"));

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stores a bounded server-side request without exposing credentials", async () => {
    const cookie = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    const response = await POST(requestWith({
      content: "  Hôm nay cả nhà cùng đi dạo.  ",
      authorRole: "father",
      idempotencyKey: "11111111-1111-4111-8111-111111111111"
    }, cookie));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload).toEqual({ status: "accepted" });
    expect(JSON.stringify(payload)).not.toContain("server-only-key");
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_submit_journal",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          p_idempotency_key: "11111111-1111-4111-8111-111111111111",
          p_content: "Hôm nay cả nhà cùng đi dạo.",
          p_author_role: "father"
        })
      })
    );
  });

  it("fails closed when the private store is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const cookie = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    const response = await POST(requestWith({
      content: "Một ngày vui",
      authorRole: "mother",
      idempotencyKey: "11111111-1111-4111-8111-111111111111"
    }, cookie));

    expect(response.status).toBe(503);
  });
});
