"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "../lib/photo-upload-contract";
import { type PhotoAuthor, sendFamilyPhoto } from "../lib/photo-upload-client";

type ComposerState = "choose" | "review" | "sending" | "sent" | "error";

function CameraGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8.5 5.5 10 3.8h4l1.5 1.7H19a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h3.5Z" />
      <circle cx="12" cy="12.3" r="3.5" />
    </svg>
  );
}

export default function PhotoComposer() {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [author, setAuthor] = useState<PhotoAuthor>("mother");
  const [state, setState] = useState<ComposerState>("choose");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("embe-photo-author");
    if (saved === "father" || saved === "mother") setAuthor(saved);
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const inferredType = chosen.type || ({
      heic: "image/heic", heif: "image/heif", jpeg: "image/jpeg", jpg: "image/jpeg",
      png: "image/png", webp: "image/webp"
    }[chosen.name.split(".").pop()?.toLowerCase() ?? ""] ?? "");
    const selected = chosen.type === inferredType
      ? chosen
      : new File([chosen], chosen.name, { lastModified: chosen.lastModified, type: inferredType });
    if (!PHOTO_MIME_TYPES.has(selected.type) || selected.size < 1 || selected.size > PHOTO_MAX_BYTES) {
      setMessage("Ảnh cần nhỏ hơn 25 MB và ở định dạng ảnh thông dụng.");
      setState("error");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setMessage("");
    setState("review");
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setCaption("");
    setMessage("");
    setState("choose");
  }

  async function send() {
    if (!file || state === "sending") return;
    if (!navigator.onLine) {
      setMessage("iPhone đang mất mạng. Ảnh vẫn ở đây; có mạng rồi chạm Gửi lại.");
      setState("error");
      return;
    }
    setState("sending");
    setMessage("");
    window.localStorage.setItem("embe-photo-author", author);
    try {
      await sendFamilyPhoto({ authorRole: author, caption: caption.trim(), file, idempotencyKey: crypto.randomUUID() });
      setState("sent");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error && error.message === "invalid_photo"
        ? "Ảnh này chưa được hỗ trợ. Hãy chọn ảnh JPG, PNG, WebP hoặc HEIC dưới 25 MB."
        : "Chưa gửi được ảnh. Ảnh vẫn ở đây để mình thử lại.");
      setState("error");
    }
  }

  return (
    <section className="photo-composer" aria-label="Gửi khoảnh khắc mới">
      <input ref={camera} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={choose} />
      <input ref={library} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choose} />

      {state === "choose" || (state === "error" && !file) ? (
        <div className="photo-window">
          <div className="photo-window-copy">
            <span>KHUNG CỬA GIA ĐÌNH</span>
            <h2>Một tấm hình,<br />gửi ngay cho nhà mình.</h2>
            <p>Riêng tư, không lượt thích công khai, không người lạ.</p>
          </div>
          <div className="photo-window-actions">
            <button className="photo-shutter" type="button" onClick={() => camera.current?.click()}>
              <CameraGlyph /><span>Chụp ngay</span>
            </button>
            <button className="photo-library" type="button" onClick={() => library.current?.click()}>Chọn từ Ảnh</button>
          </div>
          {message ? <p className="photo-message is-error" role="alert">{message}</p> : null}
        </div>
      ) : null}

      {file && (state === "review" || state === "sending" || state === "error") ? (
        <div className="photo-review">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Ảnh sắp gửi vào album gia đình" />
          <div className="photo-review-overlay">
            <label>
              <span className="sr-only">Lời nhắn ngắn</span>
              <input maxLength={180} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Viết một lời nhắn…" disabled={state === "sending"} />
            </label>
            <div className="photo-author" aria-label="Người gửi">
              <button type="button" aria-pressed={author === "mother"} onClick={() => setAuthor("mother")}>Mẹ Ngân</button>
              <button type="button" aria-pressed={author === "father"} onClick={() => setAuthor("father")}>Ba Hiếu</button>
            </div>
          </div>
          <div className="photo-review-actions">
            <button type="button" onClick={reset} disabled={state === "sending"}>Chụp lại</button>
            <button className="is-send" type="button" onClick={send} disabled={state === "sending"}>
              {state === "sending" ? "Đang gửi…" : state === "error" ? "Gửi lại" : "Gửi cho cả nhà"}
            </button>
          </div>
          {message ? <p className="photo-message is-error" role="alert">{message}</p> : null}
        </div>
      ) : null}

      {state === "sent" ? (
        <div className="photo-sent" role="status">
          <span aria-hidden="true">✓</span>
          <div><h2>Đã gửi cho nhà mình</h2><p>Ảnh đang được cất vào album riêng an toàn.</p></div>
          <button type="button" onClick={reset}>Gửi thêm</button>
        </div>
      ) : null}
    </section>
  );
}
