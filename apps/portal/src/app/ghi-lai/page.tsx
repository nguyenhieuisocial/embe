"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import AppHeader from "../../components/app-header";
import {
  enqueueJournal,
  flushJournalQueue,
  readJournalQueue
} from "../../lib/journal-offline";

type AuthorRole = "father" | "mother";

const DRAFT_KEY = "embe:journal:draft:v1";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quickPrompts = ["Một cột mốc nhỏ", "Một câu nói muốn nhớ", "Cảm xúc của hôm nay"] as const;

export default function JournalPage() {
  const [authorRole, setAuthorRole] = useState<AuthorRole>("father");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "queued" | "error" | "expired" | "rejected">("idle");
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [discardedCount, setDiscardedCount] = useState(0);
  const [queueNeedsLogin, setQueueNeedsLogin] = useState(false);
  const idempotencyKey = useRef("");

  useEffect(() => {
    try {
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanContent = content.trim();
    if (!cleanContent || state === "saving") return;
    setState("saving");
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
      idempotencyKey.current = crypto.randomUUID();
      setDraftRestored(false);
      setState("saved");
    } catch {
      try {
        const count = enqueueJournal(localStorage, queuedItem);
        localStorage.removeItem(DRAFT_KEY);
        setPendingCount(count);
        setContent("");
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

  return (
    <main className="journal-main">
      <AppHeader note="Chỉ gia đình nhìn thấy" />
      <section className="journal-shell">
        <p className="eyebrow">Một dòng cho mai sau</p>
        <h1>Hôm nay có gì đáng nhớ?</h1>
        <p className="intro">Một câu ngắn cũng đủ. EmBe sẽ tự đưa vào dòng thời gian gia đình.</p>
        <form className="journal-form" id="viet-nhat-ky" onSubmit={submit}>
          <fieldset>
            <legend>Người ghi</legend>
            <div className="author-choice">
              {(["father", "mother"] as const).map((role) => (
                <label key={role} className={authorRole === role ? "is-selected" : ""}>
                  <input type="radio" name="author" value={role} checked={authorRole === role} onChange={() => { setAuthorRole(role); setDraftRestored(false); }} />
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
          <div className="journal-meta" aria-live="polite">
            <span>{draftRestored ? "Đã khôi phục bản nháp trên thiết bị này." : content ? "Bản nháp tự lưu trên thiết bị này." : ""}</span>
            <span>{content.length}/1000</span>
          </div>
          <button type="submit" disabled={!content.trim() || state === "saving"}>{state === "saving" ? "Đang lưu…" : "Lưu vào nhật ký"}</button>
          {state === "saved" ? <p className="journal-success" role="status">Đã lưu. Nhật ký sẽ xuất hiện sau ít phút.</p> : null}
          {state === "queued" ? <p className="journal-queued" role="status">Đã giữ trên điện thoại và sẽ tự đồng bộ khi có mạng.</p> : null}
          {state === "error" ? <p className="journal-error" role="alert">Chưa lưu được. Nội dung vẫn còn ở đây để bạn thử lại.</p> : null}
          {state === "expired" ? <p className="journal-error" role="alert">Cần đăng nhập lại để lưu. Nội dung vẫn còn ở đây — <a href="/login?next=/ghi-lai">đăng nhập lại</a> rồi chạm Lưu một lần nữa.</p> : null}
          {state === "rejected" ? <p className="journal-error" role="alert">Ghi chú này chưa lưu được vì quá dài hoặc còn trống. Hãy sửa lại rồi chạm Lưu.</p> : null}
          {queueNeedsLogin && pendingCount > 0 && state !== "expired"
            ? <p className="journal-error" role="alert">Còn {pendingCount} ghi chú đang chờ gửi. Hãy <a href="/login?next=/ghi-lai">đăng nhập lại</a> để EmBe gửi tiếp.</p>
            : pendingCount > 0 && state !== "queued" ? <p className="journal-queued" role="status">Còn {pendingCount} ghi chú đang chờ đồng bộ.</p> : null}
          {discardedCount > 0 ? <p className="journal-error" role="status">Có {discardedCount} ghi chú cũ không gửi được nên EmBe đã bỏ khỏi hàng chờ.</p> : null}
        </form>
        <aside className="journal-safety">
          <strong>Chỉ dành cho kỷ niệm gia đình</strong>
          <p>Không ghi thông tin khám, địa chỉ, mật khẩu hoặc nội dung riêng tư nhạy cảm tại đây.</p>
        </aside>
      </section>
    </main>
  );
}
