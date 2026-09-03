"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import AppHeader from "../../components/app-header";
import {
  enqueueJournal,
  flushJournalQueue,
  readJournalQueue
} from "../../lib/journal-offline";
import { readDeviceRole, saveDeviceRole } from "../../lib/device-preferences";
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "../../lib/photo-upload-contract";
import { sendFamilyPhoto } from "../../lib/photo-upload-client";
import { readPhotoMetadata, type PhotoMetadata } from "../../lib/photo-metadata";

type AuthorRole = "father" | "mother";
type Checkin = { latitude: number | null; longitude: number | null; locationName: string };
type PhotoState = "ready" | "sending" | "sent" | "error";
type JournalPhoto = { file: File; id: string; metadata: PhotoMetadata; preview: string; state: PhotoState };

const DRAFT_KEY = "embe:journal:draft:v1";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PHOTO_LIMIT = 6;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quickPrompts = ["Một cột mốc nhỏ", "Một câu nói muốn nhớ", "Cảm xúc của hôm nay"] as const;

function mapsUrl(checkin: Checkin): string {
  const query = checkin.latitude != null && checkin.longitude != null
    ? `${checkin.latitude},${checkin.longitude}`
    : checkin.locationName.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function journalContent(content: string, checkin: Checkin | null): string {
  const body = content.trim() || "Một khoảnh khắc hôm nay.";
  if (!checkin) return body;
  const url = mapsUrl(checkin);
  if (!url) return body;
  const label = checkin.locationName.trim() || "Vị trí check-in";
  return `${body}\n\n📍 [${label}](${url})`;
}

function roundedCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export default function JournalPage() {
  const [authorRole, setAuthorRole] = useState<AuthorRole>("mother");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "queued" | "error" | "media_error" | "expired" | "rejected">("idle");
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [discardedCount, setDiscardedCount] = useState(0);
  const [queueNeedsLogin, setQueueNeedsLogin] = useState(false);
  const [photos, setPhotos] = useState<JournalPhoto[]>([]);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "busy" | "ready" | "manual">("idle");
  const [mediaMessage, setMediaMessage] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const photosRef = useRef<JournalPhoto[]>([]);
  const idempotencyKey = useRef("");

  useEffect(() => {
    try {
      setAuthorRole(readDeviceRole(localStorage) ?? "mother");
      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as Record<string, unknown>;
        const validRole = draft.authorRole === "father" || draft.authorRole === "mother";
        const validContent = typeof draft.content === "string" && draft.content.length <= 1000;
        const validAge = typeof draft.savedAt === "number" && Date.now() - draft.savedAt <= DRAFT_MAX_AGE_MS;
        if (validRole && validContent && validAge && draft.content) {
          setAuthorRole(draft.authorRole as AuthorRole);
          setContent(draft.content as string);
          idempotencyKey.current = typeof draft.idempotencyKey === "string" && UUID_V4.test(draft.idempotencyKey)
            ? draft.idempotencyKey
            : crypto.randomUUID();
          setDraftRestored(true);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      // The form still works when private browsing blocks local storage.
    }
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setPendingCount(readJournalQueue(localStorage).length);
    setDraftReady(true);

    let active = true;
    async function flushPending() {
      if (!navigator.onLine) return;
      const result = await flushJournalQueue(localStorage);
      if (!active) return;
      setPendingCount(result.pending);
      setDiscardedCount(result.discarded);
      setQueueNeedsLogin(result.authRequired);
      if (result.accepted > 0 && result.pending === 0) setState("saved");
    }
    void flushPending();
    window.addEventListener("online", flushPending);
    return () => {
      active = false;
      window.removeEventListener("online", flushPending);
    };
  }, []);

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => {
    for (const photo of photosRef.current) URL.revokeObjectURL(photo.preview);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try {
      if (content) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          content,
          authorRole,
          idempotencyKey: idempotencyKey.current,
          savedAt: Date.now()
        }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // Network submission remains available without local draft storage.
    }
  }, [authorRole, content, draftReady]);

  async function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!picked.length) return;
    const existing = new Set(photos.map((photo) => `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`));
    const accepted: File[] = [];
    let rejected = 0;
    for (const original of picked) {
      const extension = original.name.split(".").pop()?.toLowerCase() ?? "";
      const inferredType = original.type || ({
        heic: "image/heic", heif: "image/heif", jpeg: "image/jpeg",
        jpg: "image/jpeg", png: "image/png", webp: "image/webp"
      }[extension] ?? "");
      const file = inferredType === original.type
        ? original
        : new File([original], original.name, { type: inferredType, lastModified: original.lastModified });
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!file.type.startsWith("image/") || !PHOTO_MIME_TYPES.has(file.type) || file.size < 1 || file.size > PHOTO_MAX_BYTES || existing.has(key)) {
        rejected += 1;
        continue;
      }
      existing.add(key);
      accepted.push(file);
    }
    const room = Math.max(0, PHOTO_LIMIT - photos.length);
    const added = await Promise.all(accepted.slice(0, room).map(async (file) => ({
      file,
      id: crypto.randomUUID(),
      metadata: await readPhotoMetadata(file),
      preview: URL.createObjectURL(file),
      state: "ready" as const
    })));
    setPhotos((current) => [...current, ...added]);
    setState("idle");
    const notices = [
      rejected ? `${rejected} ảnh trùng, sai định dạng hoặc lớn hơn 25 MB` : "",
      accepted.length > room ? `Mỗi nhật ký tối đa ${PHOTO_LIMIT} ảnh` : ""
    ].filter(Boolean);
    setMediaMessage(notices.join(". "));
  }

  function updatePhoto(id: string, next: Partial<JournalPhoto>) {
    setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, ...next } : photo));
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((photo) => photo.id !== id);
    });
    setState("idle");
  }

  function clearMedia() {
    for (const photo of photosRef.current) URL.revokeObjectURL(photo.preview);
    photosRef.current = [];
    setPhotos([]);
    setCheckin(null);
    setLocationState("idle");
    setMediaMessage("");
  }

  function requestCheckin() {
    if (!("geolocation" in navigator)) {
      setCheckin({ latitude: null, longitude: null, locationName: "" });
      setLocationState("manual");
      setMediaMessage("Điện thoại chưa hỗ trợ định vị. Bạn vẫn có thể nhập tên nơi.");
      return;
    }
    setLocationState("busy");
    setMediaMessage("");
    navigator.geolocation.getCurrentPosition((position) => {
      setCheckin((current) => ({
        latitude: roundedCoordinate(position.coords.latitude),
        longitude: roundedCoordinate(position.coords.longitude),
        locationName: current?.locationName.trim() || "Vị trí hiện tại"
      }));
      setLocationState("ready");
    }, () => {
      setCheckin((current) => current ?? { latitude: null, longitude: null, locationName: "" });
      setLocationState("manual");
      setMediaMessage("Chưa lấy được vị trí. Bạn có thể nhập tên nơi hoặc bật quyền Vị trí cho EmBe.");
    }, { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanContent = journalContent(content, checkin);
    if ((!content.trim() && photos.length === 0 && !mapsUrl(checkin ?? { latitude: null, longitude: null, locationName: "" })) || cleanContent.length > 1000 || state === "saving") return;
    setState("saving");
    const photoCaption = content.trim().slice(0, 180) || "Một khoảnh khắc hôm nay.";
    try {
      for (const photo of photos.filter((item) => item.state !== "sent")) {
        updatePhoto(photo.id, { state: "sending" });
        const metadata = checkin && mapsUrl(checkin)
          ? {
              ...photo.metadata,
              latitude: checkin.latitude,
              longitude: checkin.longitude,
              locationName: checkin.locationName.trim() || "Vị trí check-in"
            }
          : photo.metadata;
        await sendFamilyPhoto({
          authorRole,
          caption: photoCaption,
          file: photo.file,
          idempotencyKey: photo.id,
          metadata
        });
        updatePhoto(photo.id, { state: "sent" });
      }
    } catch {
      setPhotos((current) => current.map((photo) => photo.state === "sending" ? { ...photo, state: "error" } : photo));
      setState("media_error");
      return;
    }
    const queuedItem = {
      content: cleanContent,
      authorRole,
      idempotencyKey: idempotencyKey.current,
      savedAt: Date.now()
    };
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(queuedItem)
      });
      // A rejected session or an invalid note can never succeed on retry. Queueing
      // those would promise a sync that never happens, so keep the text on screen.
      if (response.status === 401) {
        setState("expired");
        return;
      }
      if (response.status === 400) {
        setState("rejected");
        return;
      }
      if (!response.ok) throw new Error("journal unavailable");
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // The accepted server copy is authoritative.
      }
      setContent("");
      clearMedia();
      idempotencyKey.current = crypto.randomUUID();
      setDraftRestored(false);
      setState("saved");
    } catch {
      try {
        const count = enqueueJournal(localStorage, queuedItem);
        localStorage.removeItem(DRAFT_KEY);
        setPendingCount(count);
        setContent("");
        clearMedia();
        idempotencyKey.current = crypto.randomUUID();
        setDraftRestored(false);
        setState("queued");
      } catch {
        setState("error");
      }
    }
  }

  function applyPrompt(prompt: string) {
    setContent((current) => current.trim() ? current : `${prompt}: `);
    setDraftRestored(false);
    setState("idle");
  }

  const checkinUrl = checkin ? mapsUrl(checkin) : "";
  const hasEntry = Boolean(content.trim() || photos.length || checkinUrl);
  const preparedContent = hasEntry ? journalContent(content, checkin) : "";
  const payloadTooLong = preparedContent.length > 1000;

  return (
    <main className="journal-main">
      <AppHeader note="Chỉ gia đình nhìn thấy" />
      <section className="journal-shell">
        <p className="eyebrow">Một dòng cho mai sau</p>
        <h1>Hôm nay có gì đáng nhớ?</h1>
        <p className="intro">Một câu ngắn cũng đủ. EmBe sẽ tự đưa vào dòng thời gian gia đình.</p>
        <Link className="journal-browse-link" href="/nhat-ky">Xem nhật ký</Link>
        <form className="journal-form" id="viet-nhat-ky" onSubmit={submit}>
          <input ref={cameraInput} aria-hidden="true" tabIndex={-1} className="sr-only" type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={choosePhotos} />
          <input ref={libraryInput} aria-hidden="true" tabIndex={-1} className="sr-only" type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={choosePhotos} />
          <fieldset>
            <legend>Người ghi</legend>
            <div className="author-choice">
              {(["father", "mother"] as const).map((role) => (
                <label key={role} className={authorRole === role ? "is-selected" : ""}>
                  <input type="radio" name="author" value={role} checked={authorRole === role} onChange={() => { setAuthorRole(role); saveDeviceRole(localStorage, role); setDraftRestored(false); }} />
                  {role === "father" ? "Ba Hiếu" : "Mẹ Ngân"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="journal-prompts" aria-label="Gợi ý bắt đầu">
            {quickPrompts.map((prompt) => (
              <button type="button" key={prompt} onClick={() => applyPrompt(prompt)}>{prompt}</button>
            ))}
          </div>
          <label htmlFor="journal-content">Điều đáng nhớ</label>
          <textarea id="journal-content" maxLength={1000} rows={7} value={content} onChange={(event) => { setContent(event.target.value); setDraftRestored(false); setState("idle"); }} placeholder="Ví dụ: Hôm nay cả nhà cùng đi dạo và cười rất nhiều…" />
          <div className="journal-tools" aria-label="Ảnh và vị trí">
            <button type="button" onClick={() => cameraInput.current?.click()}>
              <span aria-hidden="true">◉</span>Chụp ảnh
            </button>
            <button type="button" onClick={() => libraryInput.current?.click()} disabled={photos.length >= PHOTO_LIMIT}>
              <span aria-hidden="true">▧</span>Chọn ảnh
            </button>
            <button className={checkinUrl ? "is-active" : ""} type="button" onClick={requestCheckin} disabled={locationState === "busy"}>
              <span aria-hidden="true">⌖</span>{locationState === "busy" ? "Đang lấy…" : "Check-in"}
            </button>
          </div>
          {photos.length ? (
            <div className="journal-photo-strip" aria-label={`${photos.length} ảnh đính kèm`}>
              {photos.map((photo, index) => (
                <figure key={photo.id} className={`is-${photo.state}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt={`Ảnh ${index + 1} đính kèm nhật ký`} />
                  {photo.state === "sent" ? <span aria-label="Đã gửi">✓</span> : null}
                  {photo.state === "sending" ? <span className="is-loading" aria-label="Đang gửi">…</span> : null}
                  {photo.state !== "sending" && photo.state !== "sent" ? (
                    <button type="button" aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => removePhoto(photo.id)}>×</button>
                  ) : null}
                </figure>
              ))}
            </div>
          ) : null}
          {locationState !== "idle" ? (
            <div className="journal-checkin">
              <label htmlFor="journal-location">Tên nơi <small>không bắt buộc</small></label>
              <div>
                <input id="journal-location" maxLength={120} value={checkin?.locationName ?? ""}
                  placeholder="Ví dụ: Công viên gần nhà" onChange={(event) => {
                    setCheckin((current) => ({
                      latitude: current?.latitude ?? null,
                      longitude: current?.longitude ?? null,
                      locationName: event.target.value
                    }));
                    setState("idle");
                  }} />
                <button type="button" aria-label="Bỏ check-in" onClick={() => { setCheckin(null); setLocationState("idle"); setMediaMessage(""); }}>×</button>
              </div>
              {checkinUrl ? <a href={checkinUrl} target="_blank" rel="noreferrer">Mở Google Maps</a> : null}
              <small>Chỉ lưu khi bạn bấm Lưu; EmBe không theo dõi vị trí nền.</small>
            </div>
          ) : null}
          {mediaMessage ? <p className="journal-media-message" role="status">{mediaMessage}</p> : null}
          <div className="journal-meta" aria-live="polite">
            <span>{payloadTooLong ? "Rút ngắn ghi chú để đủ chỗ lưu vị trí." : draftRestored ? "Đã khôi phục bản nháp trên thiết bị này." : content ? "Bản nháp tự lưu trên thiết bị này." : photos.length ? "Có thể lưu chỉ với ảnh." : ""}</span>
            <span>{preparedContent.length}/1000</span>
          </div>
          <button type="submit" disabled={!hasEntry || payloadTooLong || state === "saving"}>{state === "saving" ? "Đang lưu…" : "Lưu vào nhật ký"}</button>
          {state === "saved" ? <p className="journal-success" role="status">Đã lưu. <Link href="/nhat-ky">Mở Nhật ký để xem ngay.</Link></p> : null}
          {state === "queued" ? <p className="journal-queued" role="status">Đã giữ trên điện thoại và sẽ tự đồng bộ khi có mạng.</p> : null}
          {state === "error" ? <p className="journal-error" role="alert">Chưa lưu được. Nội dung vẫn còn ở đây để bạn thử lại.</p> : null}
          {state === "media_error" ? <p className="journal-error" role="alert">Ảnh chưa gửi được. Ghi chú và ảnh vẫn còn để bạn chạm Lưu thử lại.</p> : null}
          {state === "expired" ? <p className="journal-error" role="alert">Cần đăng nhập lại để lưu. Nội dung vẫn còn ở đây — <Link href="/login?next=/ghi-lai">đăng nhập lại</Link> rồi chạm Lưu một lần nữa.</p> : null}
          {state === "rejected" ? <p className="journal-error" role="alert">Ghi chú này chưa lưu được vì quá dài hoặc còn trống. Hãy sửa lại rồi chạm Lưu.</p> : null}
          {queueNeedsLogin && pendingCount > 0 && state !== "expired"
            ? <p className="journal-error" role="alert">Còn {pendingCount} ghi chú đang chờ gửi. Hãy <Link href="/login?next=/ghi-lai">đăng nhập lại</Link> để EmBe gửi tiếp.</p>
            : pendingCount > 0 && state !== "queued" ? <p className="journal-queued" role="status">Còn {pendingCount} ghi chú đang chờ đồng bộ.</p> : null}
          {discardedCount > 0 ? <p className="journal-error" role="status">Có {discardedCount} ghi chú cũ không gửi được nên EmBe đã bỏ khỏi hàng chờ.</p> : null}
        </form>
        <aside className="journal-safety">
          <strong>Chỉ dành cho kỷ niệm gia đình</strong>
          <p>Vị trí là tùy chọn và chỉ lưu khi bạn check-in. Không ghi thông tin khám, mật khẩu hoặc nội dung nhạy cảm tại đây.</p>
        </aside>
      </section>
    </main>
  );
}
