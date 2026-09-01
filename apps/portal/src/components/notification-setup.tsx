"use client";

import { useEffect, useState } from "react";

import type { DeviceRole } from "../lib/device-preferences";

type State = "checking" | "off" | "busy" | "on" | "blocked" | "unsupported" | "error";

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const result = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) result[index] = bytes.charCodeAt(index);
  return result;
}

function available(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export default function NotificationSetup({ role }: { role: DeviceRole | null }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    if (!available()) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function enable() {
    if (!available()) { setState("unsupported"); return; }
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "blocked" : "off"); return; }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const config = await fetch("/api/notifications/config", { cache: "no-store" });
      if (!config.ok) throw new Error("notification config unavailable");
      const { publicKey } = await config.json() as { publicKey: string };
      let subscription = await registration.pushManager.getSubscription();
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) });
      const saved = await fetch("/api/notifications/subscriptions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), deviceRole: role ?? "family", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      });
      if (!saved.ok) throw new Error("notification subscription unavailable");
      setState("on");
    } catch { setState("error"); }
  }

  async function disable() {
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/notifications/subscriptions", {
          method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch { setState("error"); }
  }

  const note = state === "on" ? "Đã bật trên điện thoại này. EmBe sẽ nhắc lịch khám, việc đến hạn và đồ dùng sắp hết."
    : state === "blocked" ? "Thông báo đang bị chặn trong cài đặt của iPhone."
      : state === "unsupported" ? "Trên iPhone, hãy thêm EmBe vào Màn hình chính để nhận lịch khám, việc đến hạn và đồ dùng sắp hết."
        : state === "error" ? "Chưa bật được. Hãy kiểm tra mạng rồi thử lại."
          : "Nhận lịch khám, việc đến hạn và đồ dùng sắp hết ngay trên điện thoại.";

  return <div className="notification-setup">
    <div><strong>Thông báo trên điện thoại</strong><p>{note}</p></div>
    {state === "on"
      ? <button type="button" onClick={() => void disable()}>Tắt thông báo</button>
      : <button type="button" disabled={state === "busy" || state === "checking"} onClick={() => void enable()}>{state === "busy" ? "Đang bật…" : "Bật thông báo"}</button>}
  </div>;
}
