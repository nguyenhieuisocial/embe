"use client";

import { useEffect, useState } from "react";

import { clearPrivateGetCache } from "../lib/private-get-cache";

type Connection = "online" | "offline" | "back";

const RECONNECTED_MS = 5000;
const UPDATE_CHECK_MS = 5 * 60 * 1000;

export default function PwaRuntime({ version = "development" }: { version?: string }) {
  const [connection, setConnection] = useState<Connection>("online");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [familyActivity, setFamilyActivity] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    let active = true;
    let backTimer: ReturnType<typeof setTimeout> | undefined;

    const goOffline = () => {
      clearTimeout(backTimer);
      setConnection("offline");
    };
    const goOnline = () => {
      setConnection((current) => {
        if (current === "online") return current;
        backTimer = setTimeout(() => setConnection("online"), RECONNECTED_MS);
        return "back";
      });
    };

    if (!navigator.onLine) setConnection("offline");
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    let registration: ServiceWorkerRegistration | undefined;
    if (process.env.NODE_ENV !== "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const worker of registrations) void worker.unregister();
      });
    } else if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((value) => {
        registration = value;
      }).catch(() => undefined);
    }

    const checkRelease = async () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          headers: { accept: "application/json" }
        });
        if (!response.ok) return;
        const value = await response.json() as { version?: unknown };
        if (active && typeof value.version === "string" && value.version !== version) {
          setUpdateAvailable(true);
        }
      } catch {
        // Mất mạng đã có banner riêng; kiểm tra lại khi app trở về foreground.
      }
    };

    const refreshWorker = () => {
      if (document.visibilityState === "visible") {
        void registration?.update();
        void checkRelease();
      }
    };
    const checkOnFocus = () => { void checkRelease(); };
    const receiveFamilyActivity = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "EMBE_FAMILY_ACTIVITY") return;
      clearPrivateGetCache();
      const title = typeof event.data.title === "string" ? event.data.title.slice(0, 80) : "Nhà mình vừa cập nhật";
      const url = typeof event.data.url === "string" && event.data.url.startsWith("/") && !event.data.url.startsWith("//") ? event.data.url : "/";
      setFamilyActivity({ title, url });
    };
    const updateTimer = window.setInterval(() => { void checkRelease(); }, UPDATE_CHECK_MS);
    document.addEventListener("visibilitychange", refreshWorker);
    window.addEventListener("focus", checkOnFocus);
    navigator.serviceWorker?.addEventListener("message", receiveFamilyActivity);
    void checkRelease();

    return () => {
      active = false;
      clearTimeout(backTimer);
      window.clearInterval(updateTimer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("focus", checkOnFocus);
      document.removeEventListener("visibilitychange", refreshWorker);
      navigator.serviceWorker?.removeEventListener("message", receiveFamilyActivity);
    };
  }, [version]);

  if (connection === "offline") return (
    <div className="connection-banner" role="status" aria-live="polite">
      Đang ngoại tuyến · giữ trang này mở để EmBe gửi lại khi có mạng
    </div>
  );

  if (connection === "back") return (
    <div className="connection-banner is-back" role="status" aria-live="polite">
      Đã có mạng trở lại · EmBe đang gửi những gì còn chờ
    </div>
  );

  if (familyActivity) return (
    <div className="app-update-banner" role="status" aria-live="polite">
      <span><strong>{familyActivity.title}</strong><small>Chạm để xem dữ liệu mới nhất.</small></span>
      <button type="button" onClick={() => {
        window.history.pushState(null, "", familyActivity.url);
        window.history.go(0);
      }}>Xem cập nhật</button>
    </div>
  );

  if (!updateAvailable) return null;

  return (
    <div className="app-update-banner" role="status" aria-live="polite">
      <span><strong>EmBe có bản mới</strong><small>Tải lại để dùng tính năng vừa cập nhật.</small></span>
      <button type="button" onClick={() => window.history.go(0)}>Cập nhật ngay</button>
    </div>
  );
}
