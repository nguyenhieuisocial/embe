import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const { rpc, getTimelineFreshness } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getTimelineFreshness: vi.fn()
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("../src/lib/timeline", () => ({ getTimelineFreshness }));

import { GET } from "../src/app/api/status/route";

const originalEnvironment = { ...process.env };

function request(authorized = true) {
  const session = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
  return new Request("https://embe.hieu.asia/api/status", {
    headers: authorized ? { cookie: `embe_session=${session}` } : {}
  });
}

describe("private family system status", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-key";
    process.env.EMBE_PHOTO_SERVER_URL = "https://embe.tail.example";
    rpc.mockReset();
    getTimelineFreshness.mockReset();
  });

  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("summarizes private services without exposing locators or worker details", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "embe_push_family_status") return { data: { mother: 1, father: 1, family: 0 }, error: null };
      if (name === "embe_get_worker_heartbeat") return {
        data: { state: "online", detail: "private-path", last_seen_at: new Date().toISOString() }, error: null
      };
      return { data: null, error: { message: "unexpected" } };
    });
    getTimelineFreshness.mockResolvedValue("fresh");

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(payload.services).toEqual({
      data: "ready", journal: "ready", food: "ready", assistant: "ready",
      notifications: "ready", photos: "ready"
    });
    expect(payload.notificationRoles).toEqual({ mother: true, father: true });
    expect(JSON.stringify(payload)).not.toContain("private-path");
    expect(JSON.stringify(payload)).not.toContain("tail.example");
  });

  it("reports setup and paused states honestly", async () => {
    delete process.env.EMBE_PHOTO_SERVER_URL;
    rpc.mockImplementation(async (name: string, input: Record<string, string>) => {
      if (name === "embe_push_family_status") return { data: { mother: 0, father: 0, family: 0 }, error: null };
      if (name === "embe_get_worker_heartbeat" && input.p_worker_name === "meal-analysis") {
        return { data: { state: "degraded", last_seen_at: new Date().toISOString() }, error: null };
      }
      return { data: { state: "online", last_seen_at: "2026-01-01T00:00:00Z" }, error: null };
    });
    getTimelineFreshness.mockResolvedValue("stale");

    const response = await GET(request());
    await expect(response.json()).resolves.toMatchObject({
      services: { data: "ready", journal: "limited", food: "limited", assistant: "paused", notifications: "setup", photos: "setup" }
    });
  });

  it("rejects unauthenticated reads", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
