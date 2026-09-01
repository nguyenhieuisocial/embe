import { describe, expect, it } from "vitest";

describe("private family push notification contract", () => {
  it("accepts only bounded web-push subscriptions and safe device settings", async () => {
    const modulePath = "../src/lib/push-notification-contract";
    const contract = await import(/* @vite-ignore */ modulePath).catch(() => null);
    expect(contract).not.toBeNull();
    if (!contract) return;
    expect(contract.normalizePushSubscription({
      subscription: {
        endpoint: "https://push.example.test/device/1",
        expirationTime: null,
        keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) }
      },
      deviceRole: "mother", timezone: "Asia/Ho_Chi_Minh"
    })).toEqual(expect.objectContaining({ deviceRole: "mother", timezone: "Asia/Ho_Chi_Minh" }));
    expect(contract.normalizePushSubscription({
      subscription: { endpoint: "javascript:alert(1)", keys: { p256dh: "x", auth: "y" } },
      deviceRole: "mother", timezone: "Asia/Ho_Chi_Minh"
    })).toBeNull();
  });

  it("ships a private indexed and deduplicated notification queue", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const path = join(process.cwd(), "..", "..", "supabase", "migrations", "20260901183000_add_private_push_notifications.sql");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, "utf8");
    expect(sql).toContain("push_subscription");
    expect(sql).toContain("push_delivery");
    expect(sql).toContain("UNIQUE (subscription_id, notification_key)");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("embe_claim_due_push_notifications");
  });

  it("dispatches reminders from the existing half-hour availability schedule", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const workflow = readFileSync(join(process.cwd(), "..", "..", ".github", "workflows", "availability.yml"), "utf8");
    expect(workflow).toContain("/api/notifications/dispatch");
    expect(workflow).toContain("EMBE_PUSH_CRON_SECRET");
  });
});
