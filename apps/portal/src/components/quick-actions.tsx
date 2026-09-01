"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { calculatePregnancyWeek } from "../lib/pregnancy";
import { useFamilyStage } from "../lib/use-family-stage";
import { Icon, type IconName } from "./embe-icon";

const DUE_DATE_KEY = "embe:pregnancy:due-date";
const STAGE_CHANGE_EVENT = "embe:pregnancy-stage-change";

type QuickAction = {
  href: string;
  icon: IconName;
  title: string;
  detail: string;
};

function actionsForStage(dueDate: string): QuickAction[] {
  const week = calculatePregnancyWeek(dueDate);
  const stageAction: QuickAction = week === null
    ? { href: "/me-bau#cai-dat-giai-doan", icon: "care", title: "Cài giai đoạn thai kỳ", detail: "Nhập ngày dự sinh khi đã có" }
    : week >= 28
      ? { href: "/do-dung", icon: "supply", title: "Xem đồ cần chuẩn bị", detail: "Nhẹ nhàng rà lại trước ngày sinh" }
      : { href: "/me-bau#health-title", icon: "care", title: "Lưu sức khỏe hôm nay", detail: "Cân nặng, ngủ, nước và vận động" };

  return [
    stageAction,
    { href: "/me-bau?quick=appointment#ho-so-kham", icon: "calendar", title: "Thêm lịch khám", detail: "Lưu ngày hẹn và hồ sơ đi cùng" },
    { href: "/me-bau?quick=meal#bua-an", icon: "meal", title: "Chụp bữa ăn", detail: "Mở camera và nhận diện món" },
    { href: "/ke-hoach?them=1#them-viec", icon: "check", title: "Thêm việc cần làm", detail: "Giao cho Mẹ Ngân, Ba Hiếu hoặc cả nhà" },
    { href: "/ghi-lai#viet-nhat-ky", icon: "write", title: "Ghi một dòng", detail: "Lưu điều vừa xảy ra" },
    { href: "/ky-niem#gui-anh", icon: "memory", title: "Chụp hoặc chọn ảnh", detail: "Gửi vào album gia đình" }
  ];
}

export default function QuickActions() {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { postpartum } = useFamilyStage();

  useEffect(() => {
    const refreshStage = () => setDueDate(localStorage.getItem(DUE_DATE_KEY) ?? "");
    refreshStage();
    window.addEventListener("storage", refreshStage);
    window.addEventListener(STAGE_CHANGE_EVENT, refreshStage);
    return () => {
      window.removeEventListener("storage", refreshStage);
      window.removeEventListener(STAGE_CHANGE_EVENT, refreshStage);
    };
  }, []);

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
        <span>Ghi nhanh</span>
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
                <p className="panel-kicker">Một chạm đến đúng việc</p>
                <h2 id="quick-actions-title">Ghi nhanh</h2>
                <p>Chọn việc đang cần, EmBe mở thẳng đúng chỗ.</p>
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
                { href: "/ky-niem#gui-anh", icon: "memory" as const, title: "Chụp một khoảnh khắc", detail: "Gửi vào album gia đình" }
              ] : actionsForStage(dueDate)).map((action) => (
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
