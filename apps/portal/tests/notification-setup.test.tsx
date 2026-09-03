import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotificationSetup from "../src/components/notification-setup";

describe("family notification setup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows which family phones are ready", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      roles: { mother: false, father: true }, enabledDevices: 1
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationSetup role="mother" />);

    await waitFor(() => expect(screen.getByText("Ba Hiếu đã bật")).toBeInTheDocument());
    expect(screen.getByText("Mẹ Ngân chưa bật")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/subscriptions", { cache: "no-store" });
  });

  it("lets an enabled iPhone send itself a real test notification", async () => {
    const subscription = {
      endpoint: "https://push.example/device",
      toJSON: () => ({ endpoint: "https://push.example/device", keys: { p256dh: "p256dh", auth: "auth" } })
    };
    const getSubscription = vi.fn().mockResolvedValue(subscription);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription } }) }
    });
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("Notification", { permission: "granted" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ roles: { mother: true, father: true }, enabledDevices: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, testSent: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationSetup role="mother" />);

    const testButton = await screen.findByRole("button", { name: "Gửi thử" });
    fireEvent.click(testButton);

    expect(await screen.findByText("Đã gửi thử. Kiểm tra Trung tâm thông báo trên iPhone này.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/subscriptions", expect.objectContaining({ method: "POST" }));
  });

  it("reports when the push service accepted the subscription but could not deliver the test", async () => {
    const subscription = {
      endpoint: "https://push.example/device",
      toJSON: () => ({ endpoint: "https://push.example/device", keys: { p256dh: "p256dh", auth: "auth" } })
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }) }
    });
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ roles: { mother: true, father: false }, enabledDevices: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, testSent: false }), { status: 201 })));

    render(<NotificationSetup role="mother" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gửi thử" }));

    expect(await screen.findByText("Chưa nhận được thông báo thử. Hãy kiểm tra quyền thông báo của EmBe trên iPhone.")).toBeInTheDocument();
  });
});
