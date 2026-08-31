"use client";

import { useEffect, useState } from "react";

type Connection = "online" | "offline" | "back";

const RECONNECTED_MS = 5000;

export default function PwaRuntime() {
  const [connection, setConnection] = useState<Connection>("online");

  useEffect(() => {
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

    const refreshWorker = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    document.addEventListener("visibilitychange", refreshWorker);

    return () => {
      clearTimeout(backTimer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", refreshWorker);
    };
  }, []);

  if (connection === "online") return null;

  return connection === "offline" ? (
    <div className="connection-banner" role="status" aria-live="polite">
      Đang ngoại tuyến · giữ trang này mở để EmBe gửi lại khi có mạng
    </div>
  ) : (
    <div className="connection-banner is-back" role="status" aria-live="polite">
      Đã có mạng trở lại · EmBe đang gửi những gì còn chờ
    </div>
  );
}
