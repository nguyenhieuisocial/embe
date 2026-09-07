"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { readDeviceRole, type DeviceRole } from "../lib/device-preferences";
import NotificationSetup from "./notification-setup";

type LocationState = "checking" | "off" | "busy" | "on" | "blocked" | "unsupported" | "error";

const DISMISSED_AT_KEY = "embe:access-guide-dismissed-at";
const LAST_LOCATION_KEY = "embe:last-location";
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function shouldOpen(storage: Pick<Storage, "getItem">, now = Date.now()): boolean {
  const dismissedAt = Number(storage.getItem(DISMISSED_AT_KEY));
  return !Number.isFinite(dismissedAt) || dismissedAt <= 0 || now - dismissedAt >= REMIND_AFTER_MS;
}

export default function DeviceAccessPrompt() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<DeviceRole | null>(null);
  const [location, setLocation] = useState<LocationState>("checking");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(true);

  const dismiss = useCallback(() => {
    try { window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now())); } catch { /* Keep dismissal for this view. */ }
    setOpen(false);
  }, []);

  useEffect(() => {
    try {
      setRole(readDeviceRole(window.localStorage));
      setOpen(shouldOpen(window.localStorage));
    } catch {
      // If Safari cannot remember dismissal, keep the optional guide closed.
      // The same permission controls remain available in the phone settings page.
      setOpen(false);
    }

    if (!("geolocation" in navigator)) {
      setLocation("unsupported");
      return;
    }
    if (!("permissions" in navigator)) {
      setLocation("off");
      return;
    }
    void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      setLocation(permission.state === "granted" ? "on" : permission.state === "denied" ? "blocked" : "off");
    }).catch(() => setLocation("off"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background: Array<{ element: HTMLElement; inert: string | null }> = [];
    document.body.style.overflow = "hidden";
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
        background.push({ element: sibling, inert: sibling.getAttribute("inert") });
        sibling.setAttribute("inert", "");
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    closeRef.current?.focus({ preventScroll: true });
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previous;
      for (const { element, inert } of background) {
        if (inert === null) element.removeAttribute("inert");
        else element.setAttribute("inert", inert);
      }
      if (restoreFocusRef.current) {
        const target = previousFocus?.isConnected && previousFocus !== document.body
          ? previousFocus : document.getElementById("main-content");
        target?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    )).filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function enableLocation() {
    if (!("geolocation" in navigator)) {
      setLocation("unsupported");
      return;
    }
    setLocation("busy");
    navigator.geolocation.getCurrentPosition((position) => {
      const value = {
        latitude: Number(position.coords.latitude.toFixed(4)),
        longitude: Number(position.coords.longitude.toFixed(4)),
        accuracy: Math.round(position.coords.accuracy),
        capturedAt: new Date().toISOString()
      };
      try { window.localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(value)); } catch { /* Permission still remains active. */ }
      setLocation("on");
    }, (error) => {
      setLocation(error.code === error.PERMISSION_DENIED ? "blocked" : "error");
    }, { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 });
  }

  if (!open) return null;

  const locationNote = location === "on" ? "Đã cho phép trên điện thoại này."
    : location === "blocked" ? "Đang bị chặn trong cài đặt quyền riêng tư của iPhone."
      : location === "unsupported" ? "Trình duyệt này không hỗ trợ lấy vị trí."
        : location === "error" ? "Chưa lấy được vị trí. Hãy kiểm tra mạng và thử lại."
          : "Chỉ dùng khi bạn ghi kỷ niệm; EmBe không theo dõi vị trí nền.";

  return (
    <div className="access-guide-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section ref={dialogRef} className="access-guide" role="dialog" aria-modal="true" aria-labelledby="access-guide-title" aria-describedby="access-guide-description" onKeyDown={keepFocusInside}>
        <div className="access-guide-handle" aria-hidden="true" />
        <header>
          <div>
            <p className="panel-kicker">Thiết lập một lần</p>
            <h2 id="access-guide-title">Hoàn tất trên iPhone</h2>
          </div>
          <button ref={closeRef} type="button" onClick={dismiss} aria-label="Đóng thiết lập">×</button>
        </header>
        <p className="access-guide-intro" id="access-guide-description">Bật những quyền bạn muốn để EmBe nhắc đúng lúc và ghi lại thuận tiện hơn.</p>

        <div className="access-guide-item">
          <div><strong>Vị trí khi dùng EmBe</strong><p>{locationNote}</p></div>
          {location === "on" ? <span className="access-guide-done" aria-label="Đã bật">✓</span> : (
            <button type="button" disabled={location === "busy" || location === "checking"} onClick={enableLocation}>
              {location === "busy" ? "Đang mở…" : "Cho phép vị trí"}
            </button>
          )}
        </div>

        <NotificationSetup role={role} />

        <div className="access-guide-item">
          <div><strong>Sức khỏe từ iPhone</strong><p>Apple yêu cầu kết nối qua Phím tắt; Safari không thể tự đọc dữ liệu Health.</p></div>
          <Link href="/me-bau/suc-khoe-iphone" onClick={() => { restoreFocusRef.current = false; dismiss(); }}>Mở kết nối Sức khỏe</Link>
        </div>

        <button className="access-guide-later" type="button" onClick={dismiss}>Để sau</button>
      </section>
    </div>
  );
}
