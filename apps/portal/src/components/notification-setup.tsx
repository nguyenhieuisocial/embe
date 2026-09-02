"use client";

import { useEffect, useState } from "react";

import type { DeviceRole } from "../lib/device-preferences";
import { readNotifyAt, saveNotifyAt } from "../lib/device-preferences";

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
  const [notifyAt, setNotifyAt] = useState("08:00");
  const [familyReady, setFamilyReady] = useState<{ mother: boolean; father: boolean } | null>(null);

  async function refreshFamilyReady() {
    try {
      const response = await fetch("/api/notifications/subscriptions", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { roles?: { mother?: boolean; father?: boolean } };
      setFamilyReady({ mother: Boolean(data.roles?.mother), father: Boolean(data.roles?.father) });
    } catch {
      // The local device controls remain usable when the family status is temporarily unavailable.
    }
  }

  useEffect(() => {
    setNotifyAt(readNotifyAt(localStorage));
    void refreshFamilyReady();
    if (!available()) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function saveSubscription(subscription: PushSubscription) {
    const saved = await fetch("/api/notifications/subscriptions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), deviceRole: role ?? "family", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, notifyAt })
    });
    if (!saved.ok) throw new Error("notification subscription unavailable");
  }

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
      await saveSubscription(subscription);
      setState("on");
      await refreshFamilyReady();
    } catch { setState("error"); }
  }

  async function changeNotifyAt(value: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return;
    setNotifyAt(value);
    saveNotifyAt(localStorage, value);
    if (state !== "on") return;
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { setState("off"); return; }
      const response = await fetch("/api/notifications/subscriptions", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, notifyAt: value })
      });
      if (!response.ok) throw new Error("notification schedule unavailable");
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
      await refreshFamilyReady();
    } catch { setState("error"); }
  }

  const note = state === "on" ? "Đã bật trên điện thoại này. EmBe sẽ báo khi người còn lại cập nhật, cùng lịch khám và việc quan trọng."
    : state === "blocked" ? "Thông báo đang bị chặn trong cài đặt của iPhone."
      : state === "unsupported" ? "Trên iPhone, hãy thêm EmBe vào Màn hình chính để nhận lịch khám, việc đến hạn và đồ dùng sắp hết."
        : state === "error" ? "Chưa bật được. Hãy kiểm tra mạng rồi thử lại."
          : "Biết ngay khi người còn lại cập nhật, cùng lịch khám và việc quan trọng.";

  return <div className="notification-setup">
    <div className="notification-copy"><strong>Thông báo trên điện thoại</strong><p>{note}</p></div>
    {state === "on"
      ? <button type="button" onClick={() => void disable()}>Tắt thông báo</button>
      : <button type="button" disabled={state === "busy" || state === "checking"} onClick={() => void enable()}>{state === "busy" ? "Đang lưu…" : "Bật thông báo"}</button>}
    {familyReady ? <div className="notification-family" aria-label="Điện thoại nhận thông báo">
      <span data-ready={familyReady.mother}>{familyReady.mother ? "Mẹ Ngân đã bật" : "Mẹ Ngân chưa bật"}</span>
      <span data-ready={familyReady.father}>{familyReady.father ? "Ba Hiếu đã bật" : "Ba Hiếu chưa bật"}</span>
    </div> : null}
    <label className="notification-time"><span>Giờ nhắc hằng ngày</span><input aria-label="Giờ nhắc hằng ngày" disabled={state === "busy" || state === "checking"} type="time" value={notifyAt} onChange={(event) => void changeNotifyAt(event.target.value)} /></label>
  </div>;
}
