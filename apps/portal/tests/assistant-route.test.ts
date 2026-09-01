import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/assistant/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };
const cookie = () => `embe_session=${createSessionCookie("server-secret")}`;

describe("private local assistant endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects unauthenticated requests", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await POST(new Request("https://embe.hieu.asia/api/assistant", { method: "POST" }))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits only an allowlisted topic and bounded period", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify("22222222-2222-4222-8222-222222222222"), { status: 200 })));
    const response = await POST(new Request("https://embe.hieu.asia/api/assistant", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json", origin: "https://embe.hieu.asia" },
      body: JSON.stringify({ topic: "ngu", days: 7, idempotencyKey: "11111111-1111-4111-8111-111111111111" })
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ id: "22222222-2222-4222-8222-222222222222", status: "pending" });
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_submit_assistant_request",
      expect.objectContaining({ body: JSON.stringify({
        p_idempotency_key: "11111111-1111-4111-8111-111111111111", p_topic: "ngu", p_days: 7, p_question: null
      }) })
    );
  });

  it("rejects a foreign origin before storage", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await POST(new Request("https://embe.hieu.asia/api/assistant", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({
        topic: "ngu",
        days: 7,
        idempotencyKey: "11111111-1111-4111-8111-111111111111"
      })
    }));

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects free-form or out-of-range requests before storage", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await POST(new Request("https://embe.hieu.asia/api/assistant", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json", origin: "https://embe.hieu.asia" },
      body: JSON.stringify({ topic: "medical-advice", days: 365, question: "private", idempotencyKey: "bad" })
    }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a bounded direct family question", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify("22222222-2222-4222-8222-222222222222"), { status: 200 })));
    const response = await POST(new Request("https://embe.hieu.asia/api/assistant", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json", origin: "https://embe.hieu.asia" },
      body: JSON.stringify({ topic: "hoi-dap", days: 7, question: "Tôi nên chuẩn bị gì cho lần khám tới?", idempotencyKey: "11111111-1111-4111-8111-111111111111" })
    }));
    expect(response.status).toBe(202);
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_submit_assistant_request",
      expect.objectContaining({ body: expect.stringContaining("Tôi nên chuẩn bị gì") })
    );
  });

  it("polls a single unguessable request without caching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "completed", answer: "Chưa có dữ liệu giấc ngủ trong 7 ngày qua."
    }), { status: 200 })));
    const response = await GET(new Request(
      "https://embe.hieu.asia/api/assistant?id=11111111-1111-4111-8111-111111111111",
      { headers: { cookie: cookie() } }
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
