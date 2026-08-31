"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Icon, type IconName } from "./embe-icon";

const actions: Array<{
  href: string;
  icon: IconName;
  title: string;
  detail: string;
}> = [
  { href: "/ghi-lai#viet-nhat-ky", icon: "write", title: "Ghi một dòng", detail: "Lưu điều vừa xảy ra" },
  { href: "/ky-niem#gui-anh", icon: "memory", title: "Chụp hoặc chọn ảnh", detail: "Gửi vào album gia đình" },
  { href: "/me-bau#health-title", icon: "care", title: "Lưu sức khỏe", detail: "Cân nặng, ngủ, nước, vận động" },
  { href: "/do-dung?them=1#them-do-dung", icon: "supply", title: "Thêm đồ dùng", detail: "Bỉm, sữa hoặc vật tư" }
];

export default function QuickActions() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
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
        aria-controls="quick-actions-sheet"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" />
        <span>Làm nhanh</span>
      </button>

      {open ? (
        <>
          <button className="sheet-backdrop quick-backdrop" type="button" aria-label="Đóng thao tác nhanh" onClick={close} />
          <section
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
                <p className="panel-kicker">MỘT CHẠM ĐẾN ĐÚNG VIỆC</p>
                <h2 id="quick-actions-title">Làm nhanh</h2>
                <p>Chọn việc đang cần, EmBe mở thẳng đúng chỗ.</p>
              </div>
              <button ref={closeRef} className="sheet-close" type="button" aria-label="Đóng" onClick={close}>
                <Icon name="close" />
              </button>
            </header>
            <nav className="sheet-body quick-action-list" aria-label="Các thao tác nhanh">
              {actions.map((action) => (
                <a className="quick-action" href={action.href} key={action.href} onClick={() => setOpen(false)}>
                  <span className="quick-action-mark" aria-hidden="true"><Icon name={action.icon} /></span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.detail}</small>
                  </span>
                  <Icon name="arrow" className="icon icon-chevron" />
                </a>
              ))}
            </nav>
          </section>
        </>
      ) : null}
    </>
  );
}
