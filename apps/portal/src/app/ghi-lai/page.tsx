"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type AuthorRole = "father" | "mother";

const DRAFT_KEY = "embe:journal:draft:v1";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function JournalPage() {
  const [authorRole, setAuthorRole] = useState<AuthorRole>("father");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
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
    setDraftReady(true);
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
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: cleanContent, authorRole, idempotencyKey: idempotencyKey.current })
      });
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
      setState("error");
    }
  }

  return (
    <main className="journal-main">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="EmBe — về trang gia đình">EmBe</a>
        <p className="privacy-note"><span aria-hidden="true">●</span> Chỉ gia đình nhìn thấy</p>
      </header>
      <section className="journal-shell">
        <p className="eyebrow">MỘT DÒNG CHO MAI SAU</p>
        <h1>Hôm nay có gì đáng nhớ?</h1>
        <p className="intro">Một câu ngắn cũng đủ. EmBe sẽ tự đưa vào dòng thời gian gia đình.</p>
        <form className="journal-form" onSubmit={submit}>
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
          <label htmlFor="journal-content">Điều đáng nhớ</label>
          <textarea id="journal-content" maxLength={1000} rows={7} value={content} onChange={(event) => { setContent(event.target.value); setDraftRestored(false); setState("idle"); }} placeholder="Ví dụ: Hôm nay cả nhà cùng đi dạo và cười rất nhiều…" />
          <div className="journal-meta">
            <span>{draftRestored ? "Đã khôi phục bản nháp trên thiết bị này." : content ? "Bản nháp tự lưu trên thiết bị này." : ""}</span>
            <span>{content.length}/1000</span>
          </div>
          <button type="submit" disabled={!content.trim() || state === "saving"}>{state === "saving" ? "Đang lưu…" : "Lưu vào nhật ký"}</button>
          {state === "saved" ? <p className="journal-success" role="status">Đã lưu. Nhật ký sẽ xuất hiện sau ít phút.</p> : null}
          {state === "error" ? <p className="journal-error" role="alert">Chưa lưu được. Nội dung vẫn còn ở đây để bạn thử lại.</p> : null}
        </form>
        <aside className="journal-safety">
          <strong>Chỉ dành cho kỷ niệm gia đình</strong>
          <p>Không ghi thông tin khám, địa chỉ, mật khẩu hoặc nội dung riêng tư nhạy cảm tại đây.</p>
        </aside>
      </section>
    </main>
  );
}
