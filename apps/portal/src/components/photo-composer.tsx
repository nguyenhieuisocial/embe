"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";

import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "../lib/photo-upload-contract";
import { type PhotoAuthor, sendFamilyPhoto } from "../lib/photo-upload-client";
import { readDeviceRole, saveDeviceRole } from "../lib/device-preferences";

type ItemState = "ready" | "sending" | "sent" | "error";
type PhotoItem = { file: File; id: string; preview: string; progress: number; state: ItemState };

const BATCH_LIMIT = 12;

function CameraGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8.5 5.5 10 3.8h4l1.5 1.7H19a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h3.5Z" />
      <circle cx="12" cy="12.3" r="3.5" />
    </svg>
  );
}

function normalizedFile(chosen: File): File {
  const inferredType = chosen.type || ({
    heic: "image/heic", heif: "image/heif", jpeg: "image/jpeg", jpg: "image/jpeg",
    png: "image/png", webp: "image/webp"
  }[chosen.name.split(".").pop()?.toLowerCase() ?? ""] ?? "");
  return chosen.type === inferredType
    ? chosen
    : new File([chosen], chosen.name, { lastModified: chosen.lastModified, type: inferredType });
}

function fileKey(file: File): string {
  return `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

export default function PhotoComposer() {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<PhotoItem[]>([]);
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [caption, setCaption] = useState("");
  const [author, setAuthor] = useState<PhotoAuthor>("mother");
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = readDeviceRole(window.localStorage) ?? window.localStorage.getItem("embe-photo-author");
    if (saved === "father" || saved === "mother") setAuthor(saved);
  }, []);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => { for (const item of itemsRef.current) URL.revokeObjectURL(item.preview); }, []);
  useEffect(() => {
    const protectQueue = (event: BeforeUnloadEvent) => {
      if (!sending) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protectQueue);
    return () => window.removeEventListener("beforeunload", protectQueue);
  }, [sending]);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).map(normalizedFile);
    event.target.value = "";
    if (!selected.length) return;
    const existing = new Set(items.map((item) => fileKey(item.file)));
    const accepted: File[] = [];
    let rejected = 0;
    let duplicated = 0;
    for (const file of selected) {
      if (!PHOTO_MIME_TYPES.has(file.type) || file.size < 1 || file.size > PHOTO_MAX_BYTES) {
        rejected += 1;
        continue;
      }
      const key = fileKey(file);
      if (existing.has(key)) {
        duplicated += 1;
        continue;
      }
      existing.add(key);
      accepted.push(file);
    }
    const room = Math.max(0, BATCH_LIMIT - items.length);
    const added = accepted.slice(0, room).map((file) => ({
      file, id: crypto.randomUUID(), preview: URL.createObjectURL(file), progress: 0, state: "ready" as const
    }));
    setItems((current) => [...current, ...added]);
    setFinished(0);
    const notices = [
      rejected ? `${rejected} ảnh không đúng định dạng hoặc lớn hơn 25 MB` : "",
      duplicated ? `${duplicated} ảnh trùng đã được bỏ qua` : "",
      accepted.length > room ? `Mỗi lượt gửi tối đa ${BATCH_LIMIT} ảnh` : ""
    ].filter(Boolean);
    setMessage(notices.join(". "));
  }

  function remove(id: string) {
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  function reset() {
    for (const item of items) URL.revokeObjectURL(item.preview);
    setItems([]);
    setCaption("");
    setFinished(0);
    setMessage("");
  }

  function updateItem(id: string, next: Partial<PhotoItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  async function send() {
    const pending = items.filter((item) => item.state !== "sent");
    if (!pending.length || sending) return;
    if (!navigator.onLine) {
      setMessage("iPhone đang mất mạng. Ảnh vẫn ở đây; có mạng rồi chạm Gửi lại.");
      return;
    }
    setSending(true);
    setMessage("");
    saveDeviceRole(window.localStorage, author);
    let completed = items.filter((item) => item.state === "sent").length;
    let failed = 0;
    for (const item of pending) {
      updateItem(item.id, { state: "sending", progress: 5 });
      try {
        await sendFamilyPhoto({
          authorRole: author,
          caption: caption.trim(),
          file: item.file,
          idempotencyKey: item.id,
          onProgress: (progress) => updateItem(item.id, { progress })
        });
        completed += 1;
        updateItem(item.id, { state: "sent", progress: 100 });
        setFinished(completed);
      } catch {
        failed += 1;
        updateItem(item.id, { state: "error", progress: 0 });
      }
    }
    setSending(false);
    if (failed) setMessage(`${failed} ảnh chưa gửi được và vẫn được giữ lại để thử lại.`);
    if (completed) router.refresh();
  }

  const allSent = items.length > 0 && items.every((item) => item.state === "sent");
  const failed = items.filter((item) => item.state === "error").length;
  const sendLabel = sending
    ? `Đang gửi ${Math.min(finished + 1, items.length)}/${items.length}`
    : failed ? `Gửi lại ${failed} ảnh` : `Gửi ${items.length} ảnh`;

  return (
    <section className="photo-composer" id="gui-anh" aria-label="Gửi khoảnh khắc mới">
      <input ref={camera} aria-hidden="true" tabIndex={-1} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={choose} />
      <input ref={library} aria-hidden="true" tabIndex={-1} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={choose} />

      {!items.length ? (
        <div className="photo-window">
          <div className="photo-window-copy">
            <span>Thêm kỷ niệm</span>
            <h2>Chụp hoặc chọn ảnh</h2>
            <p>Có thể chọn nhiều ảnh trong một lượt.</p>
          </div>
          <div className="photo-window-actions">
            <button className="photo-shutter" type="button" onClick={() => camera.current?.click()}>
              <CameraGlyph /><span>Chụp ngay</span>
            </button>
            <button className="photo-library" type="button" onClick={() => library.current?.click()}>Chọn nhiều ảnh</button>
          </div>
          {message ? <p className="photo-message is-error" role="alert">{message}</p> : null}
        </div>
      ) : null}

      {items.length && !allSent ? (
        <div className="photo-batch-review">
          <header>
            <div><p>Khoảnh khắc mới</p><h2>{items.length} ảnh đã chọn</h2></div>
            <button disabled={sending || items.length >= BATCH_LIMIT} onClick={() => library.current?.click()} type="button">Thêm ảnh</button>
          </header>
          <div className="photo-batch-grid">
            {items.map((item, index) => (
              <figure className={`is-${item.state}`} key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt={`Ảnh ${index + 1} sắp gửi`} />
                {item.state === "sending" ? <span style={{ "--photo-progress": `${item.progress}%` } as CSSProperties} aria-label={`${item.progress}%`} /> : null}
                {item.state === "sent" ? <i aria-label="Đã gửi">✓</i> : null}
                {item.state === "error" ? <i aria-label="Chưa gửi được">!</i> : null}
                {item.state === "ready" && !sending ? <button aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => remove(item.id)} type="button">×</button> : null}
              </figure>
            ))}
          </div>
          <label className="photo-batch-caption">
            <span>Lời nhắn chung <small>không bắt buộc</small></span>
            <input maxLength={180} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Ví dụ: Một buổi chiều thật dịu dàng…" disabled={sending} />
          </label>
          <div className="photo-author" aria-label="Người gửi">
            <button type="button" disabled={sending} aria-pressed={author === "mother"} onClick={() => setAuthor("mother")}>Mẹ Ngân</button>
            <button type="button" disabled={sending} aria-pressed={author === "father"} onClick={() => setAuthor("father")}>Ba Hiếu</button>
          </div>
          <div className="photo-batch-actions">
            <button type="button" onClick={reset} disabled={sending}>Bỏ lượt này</button>
            <button className="is-send" type="button" onClick={send} disabled={sending}>{sendLabel}</button>
          </div>
          {sending ? <p className="photo-batch-status" role="status">Giữ EmBe mở đến khi gửi xong. Nếu mạng chập chờn, ảnh lỗi có thể gửi lại riêng.</p> : null}
          {message ? <p className="photo-message is-error" role="alert">{message}</p> : null}
        </div>
      ) : null}

      {allSent ? (
        <div className="photo-sent" role="status">
          <span aria-hidden="true">✓</span>
          <div><h2>Đã gửi {items.length} ảnh</h2><p>Ảnh đang được cất vào album riêng an toàn.</p></div>
          <button type="button" onClick={reset}>Gửi thêm</button>
        </div>
      ) : null}
    </section>
  );
}
