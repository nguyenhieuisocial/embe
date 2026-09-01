"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { MediaMemory } from "../lib/media";

type ShareState = "idle" | "file" | "link" | "done" | "error";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export default function PhotoShareButton({ memory }: { memory: MediaMemory }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ShareState>("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) firstActionRef.current?.focus(); }, [open]);

  function closeSheet(): void {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function keepFocusInSheet(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(sheetRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function shareFile(): Promise<void> {
    setState("file");
    try {
      const response = await fetch(`/api/media/${memory.id}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const extension = memory.mimeType === "image/webp" ? "webp" : "jpg";
      const file = new File([blob], `anh-embe-${memory.id.slice(0, 8)}.${extension}`, { type: memory.mimeType });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: memory.title, text: memory.caption || undefined });
      } else {
        downloadBlob(blob, file.name);
      }
      setState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setState("idle");
      else setState("error");
    }
  }

  async function shareLink(): Promise<void> {
    setState("link");
    try {
      const response = await fetch(`/api/share/media/${memory.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("share link failed");
      const payload = await response.json() as { path?: string };
      if (!payload.path?.startsWith("/chia-se/")) throw new Error("invalid link");
      const url = new URL(payload.path, window.location.origin).href;
      if (navigator.share) await navigator.share({ title: memory.title, text: "Một kỷ niệm từ gia đình Hiếu – Ngân", url });
      else await copyText(url);
      setState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setState("idle");
      else setState("error");
    }
  }

  return <>
    <button ref={triggerRef} aria-expanded={open} aria-label="Chia sẻ ảnh" className="photo-viewer-share" onClick={() => { setOpen(true); setState("idle"); }} type="button">
      <span aria-hidden="true">↗</span><span className="photo-action-label">Chia sẻ</span>
    </button>
    {open ? <div className="photo-share-backdrop" onClick={closeSheet} onKeyDown={keepFocusInSheet}>
      <section ref={sheetRef} aria-label="Cách chia sẻ ảnh" className="photo-share-sheet" onClick={(event) => event.stopPropagation()}>
        <span className="photo-share-handle" aria-hidden="true" />
        <div><h2>Chia sẻ kỷ niệm</h2><p>Gửi ảnh trực tiếp hoặc gửi link riêng để bạn bè xem trong 7 ngày.</p></div>
        <button ref={firstActionRef} aria-label="Gửi ảnh" disabled={state === "file" || state === "link"} onClick={() => void shareFile()} type="button">
          <span aria-hidden="true">▧</span><strong>Gửi ảnh</strong><small>Zalo, Messenger, AirDrop…</small>
        </button>
        <button aria-label="Gửi link xem 7 ngày" disabled={state === "file" || state === "link"} onClick={() => void shareLink()} type="button">
          <span aria-hidden="true">↗</span><strong>Gửi link xem 7 ngày</strong><small>Người nhận không cần đăng nhập</small>
        </button>
        <p aria-live="polite" className={`photo-share-status is-${state}`}>
          {state === "file" ? "Đang chuẩn bị ảnh…" : state === "link" ? "Đang tạo link riêng…" : state === "done" ? "Đã mở bảng chia sẻ." : state === "error" ? "Chưa chia sẻ được. Hãy thử lại." : ""}
        </p>
        <button className="photo-share-cancel" onClick={closeSheet} type="button">Đóng</button>
      </section>
    </div> : null}
  </>;
}
