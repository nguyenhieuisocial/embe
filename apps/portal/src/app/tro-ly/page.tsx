"use client";

import { useState } from "react";

type Topic = "ngu" | "bu" | "moi-truong";
type State = "ready" | "waiting" | "done" | "error";

const topics: Array<{ id: Topic; icon: string; title: string; detail: string }> = [
  { id: "ngu", icon: "☾", title: "Giấc ngủ", detail: "Nhịp ngủ và thời lượng" },
  { id: "bu", icon: "◡", title: "Bú sữa", detail: "Số lần và lượng sữa" },
  { id: "moi-truong", icon: "⌁", title: "Môi trường", detail: "Nhiệt độ, độ ẩm và giấc ngủ" }
];

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function AssistantPage() {
  const [days, setDays] = useState(7);
  const [state, setState] = useState<State>("ready");
  const [answer, setAnswer] = useState("");

  async function ask(topic: Topic) {
    setState("waiting");
    setAnswer("");
    try {
      const submitted = await fetch("/api/assistant", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, days, idempotencyKey: crypto.randomUUID() })
      });
      if (!submitted.ok) throw new Error("assistant unavailable");
      const { id } = await submitted.json() as { id: string };
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (attempt > 0) await pause(1000);
        const response = await fetch(`/api/assistant?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("assistant unavailable");
        const result = await response.json() as { status: string; answer?: string };
        if (result.status === "completed" && result.answer) {
          setAnswer(result.answer);
          setState("done");
          return;
        }
        if (result.status === "failed") throw new Error("assistant failed");
      }
      throw new Error("assistant timeout");
    } catch {
      setState("error");
    }
  }

  return (
    <main className="assistant-main">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="EmBe — về trang gia đình">EmBe</a>
        <p className="privacy-note"><span aria-hidden="true">●</span> AI chạy tại máy nhà</p>
      </header>
      <section className="assistant-hero">
        <p className="eyebrow">TRỢ LÝ RIÊNG CỦA GIA ĐÌNH</p>
        <h1>EmBe hiểu<br /><em>số liệu của nhà mình</em></h1>
        <p className="intro">Chọn điều muốn xem. EmBe chỉ đọc số liệu tổng hợp và không thay thế tư vấn của bác sĩ.</p>
      </section>
      <div className="assistant-period" role="group" aria-label="Khoảng thời gian">
        {[7, 14, 30].map((value) => (
          <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} ngày</button>
        ))}
      </div>
      <section className="assistant-topics" aria-label="Chọn nội dung cần phân tích">
        {topics.map((topic) => (
          <button key={topic.id} type="button" disabled={state === "waiting"} onClick={() => void ask(topic.id)} aria-label={`Hỏi về ${topic.title}`}>
            <span aria-hidden="true">{topic.icon}</span><span><strong>{topic.title}</strong><small>{topic.detail}</small></span><b aria-hidden="true">→</b>
          </button>
        ))}
      </section>
      {state === "waiting" ? <section className="assistant-answer is-waiting" role="status"><span /><span /><p>Máy nhà đang xem lại số liệu…</p></section> : null}
      {state === "done" ? <section className="assistant-answer" aria-live="polite"><small>KẾT QUẢ TỪ MÁY NHÀ</small><p>{answer}</p></section> : null}
      {state === "error" ? <p className="assistant-error" role="alert">Máy nhà chưa trả lời được lúc này. Dữ liệu vẫn an toàn; hãy chạm thử lại sau.</p> : null}
      <aside className="assistant-boundary"><strong>Riêng tư theo thiết kế</strong><p>Không gửi ghi chú, thời điểm chi tiết hoặc hồ sơ gốc cho mô hình AI.</p></aside>
    </main>
  );
}
