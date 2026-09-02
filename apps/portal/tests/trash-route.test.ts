import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";
import { GET, POST } from "../src/app/api/trash/route";

const originalEnvironment = { ...process.env };
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(method = "GET", body?: unknown, authenticated = true): Request {
  return new Request("https://embe.hieu.asia/api/trash", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(authenticated ? { cookie: `embe_session=${createSessionCookie("server-secret", new Date(), sessionId)}` } : {}),
      ...(method === "GET" ? {} : { origin: "https://embe.hieu.asia", "content-type": "application/json" })
    }
  });
}

describe("private family trash endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("requires a family session and returns only normalized deleted items", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([
      { kind: "task", id: "12", title: "Mua vitamin", detail: "Mẹ Ngân", deleted_at: "2026-09-02T10:00:00Z" },
      { kind: "medical", id: "11111111-1111-4111-8111-111111111111", title: "Khám thai", detail: "Bệnh viện", deleted_at: "2026-09-02T09:00:00Z" },
      { kind: "unknown", id: "x", title: "ignore", detail: "", deleted_at: "bad" }
    ]), { status: 200 }));

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [
      { kind: "task", id: "12", title: "Mua vitamin", detail: "Mẹ Ngân", deletedAt: "2026-09-02T10:00:00Z" },
      { kind: "medical", id: "11111111-1111-4111-8111-111111111111", title: "Khám thai", detail: "Bệnh viện", deletedAt: "2026-09-02T09:00:00Z" }
    ] });
  });

  it("restores a task through a bounded same-origin mutation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const response = await POST(request("POST", { kind: "task", id: "12" }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("embe_restore_family_task"),
      expect.objectContaining({ body: JSON.stringify({ p_id: "12" }) })
    );
  });

  it("restores a medical record through the atomic record-and-task RPC", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const id = "11111111-1111-4111-8111-111111111111";
    const response = await POST(request("POST", { kind: "medical", id }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("embe_restore_pregnancy_medical_record_with_task"),
      expect.objectContaining({ body: JSON.stringify({ p_id: id }) })
    );
  });

  it("rejects malformed, extra and cross-site restore requests", async () => {
    expect((await POST(request("POST", { kind: "task", id: "nope" }))).status).toBe(400);
    expect((await POST(request("POST", { kind: "medical", id: "11111111-1111-4111-8111-111111111111", extra: true }))).status).toBe(400);
    const crossSite = new Request("https://embe.hieu.asia/api/trash", {
      method: "POST", body: JSON.stringify({ kind: "task", id: "12" }),
      headers: { cookie: `embe_session=${createSessionCookie("server-secret", new Date(), sessionId)}`, origin: "https://evil.example" }
    });
    expect((await POST(crossSite)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized restore body before parsing it", async () => {
    const oversized = new Request("https://embe.hieu.asia/api/trash", {
      method: "POST",
      body: JSON.stringify({ kind: "task", id: "12" }),
      headers: {
        cookie: `embe_session=${createSessionCookie("server-secret", new Date(), sessionId)}`,
        origin: "https://embe.hieu.asia",
        "content-type": "application/json",
        "content-length": "5000"
      }
    });
    expect((await POST(oversized)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
