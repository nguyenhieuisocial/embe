"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useFamilyStage } from "../lib/use-family-stage";
import { Icon, type IconName } from "./embe-icon";

type QuickAction = {
  href: string;
  icon: IconName;
  title: string;
  detail: string;
};

const documentAction: QuickAction = {
  href: "/me-bau/ho-so#them-giay-to", icon: "album",
  title: "Chụp hoặc chọn giấy tờ", detail: "Phiếu thu, đơn thuốc, siêu âm · ảnh/PDF"
};

function actionsForStage(): QuickAction[] {
  return [
    { href: "/me-bau/bua-an", icon: "meal", title: "Ghi bữa ăn", detail: "Chụp ảnh hoặc nhập món" },
    { href: "/me-bau/suc-khoe", icon: "care", title: "Ghi sức khỏe", detail: "Số đo, giấc ngủ và nước" },
    documentAction,
    { href: "/me-bau/ho-so?quick=appointment#ho-so-kham", icon: "calendar", title: "Thêm lịch khám", detail: "Ngày hẹn và nơi khám" },
    { href: "/ke-hoach?them=1#them-viec", icon: "check", title: "Thêm việc cần làm", detail: "Giao cho Mẹ Ngân, Ba Hiếu hoặc cả nhà" },
    { href: "/ghi-lai#viet-nhat-ky", icon: "write", title: "Ghi một dòng", detail: "Lưu điều vừa xảy ra" },
    { href: "/ky-niem#gui-anh", icon: "memory", title: "Chụp hoặc chọn ảnh", detail: "Gửi vào album gia đình" }
  ];
}

export default function QuickActions() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(true);
  const { postpartum } = useFamilyStage();

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background: Array<{ element: HTMLElement; inert: string | null }> = [];
    // Keep the page and navigation out of touch, keyboard and screen-reader
    // navigation, without making the sheet or its dismiss backdrop inert.
    let branch: HTMLElement = sheet;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (!(sibling instanceof HTMLElement) || sibling === branch || sibling === backdropRef.current) continue;
        background.push({ element: sibling, inert: sibling.getAttribute("inert") });
        sibling.setAttribute("inert", "");
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    closeRef.current?.focus({ preventScroll: true });
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !sheet.contains(event.target)) closeRef.current?.focus({ preventScroll: true });
    };
    const closeOnNavigation = () => {
      restoreFocusRef.current = false;
      setOpen(false);
    };
    document.addEventListener("focusin", containFocus);
    window.addEventListener("popstate", closeOnNavigation);
    window.addEventListener("hashchange", closeOnNavigation);
    return () => {
      document.removeEventListener("focusin", containFocus);
      window.removeEventListener("popstate", closeOnNavigation);
      window.removeEventListener("hashchange", closeOnNavigation);
      document.body.style.overflow = previousOverflow;
      for (const { element, inert } of background) {
        if (inert === null) element.removeAttribute("inert");
        else element.setAttribute("inert", inert);
      }
      if (restoreFocusRef.current && triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="quick-trigger"
        type="button"
        aria-label="Mở thao tác nhanh"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="quick-actions-sheet"
        onClick={() => { restoreFocusRef.current = true; setOpen(true); }}
      >
        <Icon name="plus" />
        <span>Ghi nhanh</span>
      </button>

      {open ? (
        <>
          <button ref={backdropRef} className="sheet-backdrop quick-backdrop" type="button" tabIndex={-1} aria-hidden="true" aria-label="Đóng thao tác nhanh" onClick={close} />
          <section
            ref={sheetRef}
            className="sheet quick-sheet"
            id="quick-actions-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-actions-title"
            onKeyDown={keepFocusInside}
          >
            <span className="sheet-grip" aria-hidden="true" />
            <header className="sheet-head">
              <div>
                <h2 id="quick-actions-title">Ghi nhanh</h2>
                <p>Một chạm đến việc đang cần.</p>
              </div>
              <button ref={closeRef} className="sheet-close" type="button" aria-label="Đóng" onClick={close}>
                <Icon name="close" />
              </button>
            </header>
            <nav className="sheet-body quick-action-list" aria-label="Các thao tác nhanh">
              {(postpartum ? [
                { href: "/be?quick=feeding", icon: "milk" as const, title: "Bắt đầu cữ bú", detail: "Chạm một lần, kết thúc khi Bé bú xong" },
                { href: "/be?quick=diaper", icon: "check" as const, title: "Ghi thay tã", detail: "Ướt, bẩn hoặc cả hai" },
                { href: "/be?quick=sleep", icon: "sleep" as const, title: "Bắt đầu giấc ngủ", detail: "Theo dõi bằng bộ đếm giờ" },
                { href: "/be?quick=temperature", icon: "room" as const, title: "Ghi nhiệt độ", detail: "Lưu số đo vừa kiểm tra" },
                { href: "/me", icon: "care" as const, title: "Mẹ hồi phục hôm nay", detail: "Ghi thật nhanh các dấu hiệu cần theo dõi" },
                documentAction,
                { href: "/ky-niem#gui-anh", icon: "memory" as const, title: "Chụp một khoảnh khắc", detail: "Gửi vào album gia đình" }
              ] : actionsForStage()).map((action) => (
                <Link className="quick-action" href={action.href} prefetch={false} key={action.href} onClick={() => { restoreFocusRef.current = false; setOpen(false); }}>
                  <span className="quick-action-mark" aria-hidden="true"><Icon name={action.icon} /></span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.detail}</small>
                  </span>
                  <Icon name="arrow" className="icon icon-chevron" />
                </Link>
              ))}
            </nav>
          </section>
        </>
      ) : null}
    </>
  );
}
