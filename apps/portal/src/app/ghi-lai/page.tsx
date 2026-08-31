"use client";

import { FormEvent, useState } from "react";

type AuthorRole = "father" | "mother";

export default function JournalPage() {
  const [authorRole, setAuthorRole] = useState<AuthorRole>("father");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanContent = content.trim();
    if (!cleanContent || state === "saving") return;
    setState("saving");
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: cleanContent, authorRole, idempotencyKey: crypto.randomUUID() })
      });
      if (!response.ok) throw new Error("journal unavailable");
      setContent("");
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
                  <input type="radio" name="author" value={role} checked={authorRole === role} onChange={() => setAuthorRole(role)} />
                  {role === "father" ? "Ba Hiếu" : "Mẹ Ngân"}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="journal-content">Điều đáng nhớ</label>
          <textarea id="journal-content" maxLength={1000} rows={7} value={content} onChange={(event) => { setContent(event.target.value); setState("idle"); }} placeholder="Ví dụ: Hôm nay cả nhà cùng đi dạo và cười rất nhiều…" />
          <div className="journal-meta"><span>{content.length}/1000</span></div>
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
