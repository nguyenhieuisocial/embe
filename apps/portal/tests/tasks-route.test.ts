import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateFamilyViews = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/family-view-revalidation", () => ({ revalidateFamilyViews }));

import { DELETE, GET, PATCH, POST } from "../src/app/api/tasks/route";

const originalEnvironment = { ...process.env };

function cookie(): string {
  return `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`;
}

function request(method: string, body?: unknown, authenticated = true): Request {
  return new Request("https://embe.hieu.asia/api/tasks", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(authenticated ? { cookie: cookie() } : {}),
      ...(method === "GET" ? {} : { origin: "https://embe.hieu.asia", "content-type": "application/json" })
    }
  });
}

describe("private family task endpoint", () => {
  beforeEach(() => {
    revalidateFamilyViews.mockClear();
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects unauthenticated reads and cross-site writes", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    const crossSite = new Request("https://embe.hieu.asia/api/tasks", {
      method: "POST",
      body: "{}",
      headers: { cookie: cookie(), origin: "https://evil.example" }
    });
    expect((await POST(crossSite)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads only a bounded valid date range", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/tasks?from=2026-09-01&to=2026-09-07", {
      headers: { cookie: cookie() }
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_list_family_tasks",
      expect.objectContaining({ body: JSON.stringify({ p_from: "2026-09-01", p_to: "2026-09-07" }) })
    );
    expect((await GET(new Request("https://embe.hieu.asia/api/tasks?from=2026-01-01&to=2026-12-31", {
      headers: { cookie: cookie() }
    }))).status).toBe(400);
  });

  it("creates an idempotent task with a controlled deep link", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: "12" }), { status: 200 }));
    const response = await POST(request("POST", {
      idempotencyKey: "811fe5a0-f59b-4f8c-8eb7-64fb2ef89256",
      title: "Đặt lịch khám",
      note: "Mang theo kết quả xét nghiệm",
      ownerRole: "family",
      category: "appointment",
      linkTarget: "pregnancy",
      dueOn: "2026-09-03",
      dueTime: "09:30",
      repeatRule: "none"
    }));
    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("embe_create_family_task"),
      expect.objectContaining({ method: "POST" })
    );
    expect(revalidateFamilyViews).toHaveBeenCalledOnce();
  });

  it("rejects unknown links, malformed IDs and oversized text", async () => {
    const invalid = await POST(request("POST", {
      idempotencyKey: "811fe5a0-f59b-4f8c-8eb7-64fb2ef89256",
      title: "x".repeat(121), note: "", ownerRole: "family", category: "general",
      linkTarget: "https://evil.example", dueOn: "2026-09-03", dueTime: null, repeatRule: "none"
    }));
    expect(invalid.status).toBe(400);
    expect((await PATCH(request("PATCH", { action: "complete", id: "nope", occurrenceOn: "2026-09-03", completed: true }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("completes, updates and soft-deletes a task", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    expect((await PATCH(request("PATCH", {
      action: "complete", id: "12", occurrenceOn: "2026-09-03", completed: true, completedBy: "mother"
    }))).status).toBe(200);
    expect((await PATCH(request("PATCH", {
      action: "update", id: "12", title: "Khám thai", note: "", ownerRole: "family",
      category: "appointment", linkTarget: "pregnancy", dueOn: "2026-09-04", dueTime: null, repeatRule: "none"
    }))).status).toBe(200);
    expect((await DELETE(request("DELETE", { id: "12" }))).status).toBe(200);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      expect.stringContaining("embe_set_family_task_completion"),
      expect.stringContaining("embe_update_family_task"),
      expect.stringContaining("embe_delete_family_task")
    ]));
    expect(revalidateFamilyViews).toHaveBeenCalledTimes(3);
  });
});
