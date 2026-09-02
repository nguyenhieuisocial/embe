import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const { rpc, sendNotification, setVapidDetails } = vi.hoisted(() => ({
  rpc: vi.fn(), sendNotification: vi.fn(), setVapidDetails: vi.fn()
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("web-push", () => ({ default: { sendNotification, setVapidDetails } }));

import * as configRoute from "../src/app/api/notifications/config/route";
import * as subscriptionRoute from "../src/app/api/notifications/subscriptions/route";
import * as dispatchRoute from "../src/app/api/notifications/dispatch/route";
import * as activityRoute from "../src/app/api/notifications/activity/route";
import { familyActivityKind } from "../src/lib/family-activity-notification";

const originalEnvironment = { ...process.env };
function cookie() { return `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`; }
function request(url: string, method = "GET", body?: unknown, authorized = true) {
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(method === "GET" ? {} : { origin: "https://embe.hieu.asia" }),
    ...(authorized ? { cookie: cookie() } : {})
  } });
}

describe("private family push routes", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-key";
    process.env.EMBE_VAPID_PUBLIC_KEY = "public-key";
    process.env.EMBE_VAPID_PRIVATE_KEY = "private-key";
    process.env.EMBE_PUSH_CRON_SECRET = "cron-secret";
    rpc.mockReset(); sendNotification.mockReset(); setVapidDetails.mockReset();
  });
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("keeps configuration private and registers only an authenticated family phone", async () => {
    expect((await configRoute.GET(request("https://embe.hieu.asia/api/notifications/config", "GET", undefined, false))).status).toBe(401);
    expect(await (await configRoute.GET(request("https://embe.hieu.asia/api/notifications/config"))).json()).toEqual({ publicKey: "public-key" });

    rpc.mockResolvedValueOnce({ data: "11111111-1111-4111-8111-111111111111", error: null });
    sendNotification.mockResolvedValueOnce({ statusCode: 201 });
    const response = await subscriptionRoute.POST(request("https://embe.hieu.asia/api/notifications/subscriptions", "POST", {
      subscription: { endpoint: "https://push.example.test/device/1", expirationTime: null, keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) } },
      deviceRole: "mother", timezone: "Asia/Ho_Chi_Minh", notifyAt: "07:30"
    }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("embe_upsert_push_subscription", expect.objectContaining({ p_device_role: "mother", p_notify_at: "07:30" }));
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.test/device/1" }),
      expect.stringContaining("Đã bật thông báo"), expect.objectContaining({ TTL: 86_400 })
    );
  });

  it("dispatches a claimed reminder once and records delivery success", async () => {
    const notification = {
      id: "22222222-2222-4222-8222-222222222222", endpoint: "https://push.example.test/device/1",
      p256dh: "a".repeat(87), auth: "b".repeat(22), title: "EmBe nhắc nhẹ", body: "1 lịch khám trong 2 ngày tới",
      url: "/me-bau#ho-so-kham", tag: "daily:2026-09-01"
    };
    rpc.mockResolvedValueOnce({ data: [notification], error: null }).mockResolvedValueOnce({ data: null, error: null });
    sendNotification.mockResolvedValueOnce({ statusCode: 201 });
    const response = await dispatchRoute.POST(new Request("https://embe.hieu.asia/api/notifications/dispatch", {
      method: "POST", headers: { authorization: "Bearer cron-secret" }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(sendNotification.mock.calls[0][1]).not.toContain(notification.p256dh);
    expect(sendNotification.mock.calls[0][1]).not.toContain(notification.endpoint);
    expect(rpc).toHaveBeenLastCalledWith("embe_complete_push_delivery", expect.objectContaining({ p_sent: true }));
  });

  it("updates the reminder time for only the current phone", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await subscriptionRoute.PATCH(request("https://embe.hieu.asia/api/notifications/subscriptions", "PATCH", {
      endpoint: "https://push.example.test/device/1", notifyAt: "19:15"
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("embe_update_push_schedule", {
      p_endpoint: "https://push.example.test/device/1", p_notify_at: "19:15"
    });
  });

  it("immediately notifies the other person after a safe family update", async () => {
    const notification = {
      id: "22222222-2222-4222-8222-222222222222", endpoint: "https://push.example.test/device/2",
      p256dh: "a".repeat(87), auth: "b".repeat(22), title: "Mẹ Ngân vừa cập nhật",
      body: "Nhật ký bữa ăn có thông tin mới.", url: "/me-bau#bua-an",
      tag: "activity:33333333-3333-4333-8333-333333333333"
    };
    rpc.mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: [notification], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    sendNotification.mockResolvedValueOnce({ statusCode: 201 });

    const response = await activityRoute.POST(request("https://embe.hieu.asia/api/notifications/activity", "POST", {
      eventId: "33333333-3333-4333-8333-333333333333",
      sourceEndpoint: "https://push.example.test/device/1",
      pathname: "/api/meals",
      method: "POST"
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ queued: 1, sent: 1, failed: 0 });
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_enqueue_family_activity", {
      p_event_id: "33333333-3333-4333-8333-333333333333",
      p_source_endpoint: "https://push.example.test/device/1",
      p_activity_kind: "meal"
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "embe_claim_family_activity", {
      p_event_id: "33333333-3333-4333-8333-333333333333", p_limit: 20
    });
    expect(sendNotification.mock.calls[0][1]).toContain("Nhật ký bữa ăn có thông tin mới.");
    expect(sendNotification.mock.calls[0][1]).not.toContain("device/1");
  });

  it("rejects unauthenticated or unrelated mutation reports", async () => {
    const unauthorized = await activityRoute.POST(request("https://embe.hieu.asia/api/notifications/activity", "POST", {
      eventId: "33333333-3333-4333-8333-333333333333", pathname: "/api/meals", method: "POST"
    }, false));
    expect(unauthorized.status).toBe(401);

    const unrelated = await activityRoute.POST(request("https://embe.hieu.asia/api/notifications/activity", "POST", {
      eventId: "33333333-3333-4333-8333-333333333333", pathname: "/api/auth/login", method: "POST"
    }));
    expect(unrelated.status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("covers family updates but ignores technical API operations", () => {
    expect(familyActivityKind("/api/pregnancy/iphone-health")).toBe("health");
    expect(familyActivityKind("/api/pregnancy/records/record-id/documents")).toBe("medical");
    expect(familyActivityKind("/api/memories/memory-id/reactions")).toBe("memory");
    expect(familyActivityKind("/api/baby/medical/record-id/documents")).toBe("baby");
    expect(familyActivityKind("/api/trash")).toBe("profile");
    expect(familyActivityKind("/api/family/export")).toBeNull();
    expect(familyActivityKind("/api/share/media/media-id")).toBeNull();
  });
});
