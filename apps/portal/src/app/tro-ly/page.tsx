"use client";

import { useState } from "react";

import AppHeader from "../../components/app-header";
import { Icon, type IconName } from "../../components/embe-icon";

type Topic = "ngu" | "bu" | "moi-truong";
type State = "ready" | "waiting" | "done" | "error";

const topics: Array<{ id: Topic; icon: IconName; title: string; detail: string }> = [
  { id: "ngu", icon: "sleep", title: "Giấc ngủ của em bé", detail: "Nhịp ngủ và thời lượng" },
  { id: "bu", icon: "milk", title: "Bú sữa của em bé", detail: "Số lần và lượng sữa" },
  { id: "moi-truong", icon: "room", title: "Phòng ngủ của em bé", detail: "Nhiệt độ, độ ẩm và giấc ngủ" }
];

const pregnancyHelp = [
  { href: "/me-bau#viec-hom-nay", icon: "check" as const, title: "Việc nên làm hôm nay", detail: "Checklist ngắn, không tạo áp lực" },
  { href: "/me-bau#cam-nang", icon: "care" as const, title: "Ăn gì, kiêng gì", detail: "Chỉ dẫn đã đối chiếu nguồn y tế" },
  { href: "/me-bau#can-lien-he", icon: "alert" as const, title: "Dấu hiệu cần liên hệ", detail: "Biết khi nào không nên chờ" }
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
      <AppHeader note="Trợ lý riêng của gia đình" />
      <section className="assistant-hero">
        <p className="eyebrow">Đồng hành đúng giai đoạn</p>
        <h1>Mẹ Ngân cần gì lúc này?</h1>
        <p className="intro">Hiện tại EmBe ưu tiên thai kỳ. Chọn một việc cần xem ngay; nội dung không thay thế tư vấn của bác sĩ.</p>
      </section>
      <section className="assistant-topics pregnancy-help" aria-label="Hỗ trợ thai kỳ">
        {pregnancyHelp.map((item) => (
          <a key={item.href} href={item.href} aria-label={item.title}>
            <span className="shortcut-mark" aria-hidden="true"><Icon name={item.icon} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><Icon name="arrow" className="icon icon-chevron" />
          </a>
        ))}
      </section>
      <details className="future-assistant">
        <summary><span><small>ĐỂ DÀNH CHO GIAI ĐOẠN SAU</small><strong>Sau khi em bé chào đời</strong></span><span aria-hidden="true">⌄</span></summary>
        <p>Phần này phân tích số liệu bú, ngủ và môi trường khi gia đình bắt đầu ghi nhận sau sinh.</p>
        <div className="assistant-period" role="group" aria-label="Khoảng thời gian">
          {[7, 14, 30].map((value) => (
            <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} ngày</button>
          ))}
        </div>
        <section className="assistant-topics" aria-label="Chọn nội dung sau sinh cần phân tích">
          {topics.map((topic) => (
            <button key={topic.id} type="button" disabled={state === "waiting"} onClick={() => void ask(topic.id)} aria-label={`Hỏi về ${topic.title}`}>
              <span className="shortcut-mark" aria-hidden="true"><Icon name={topic.icon} /></span><span><strong>{topic.title}</strong><small>{topic.detail}</small></span><Icon name="arrow" className="icon icon-chevron" />
            </button>
          ))}
        </section>
      </details>
      {state === "waiting" ? <section className="assistant-answer is-waiting" role="status"><span /><span /><p>Máy nhà đang xem lại số liệu…</p></section> : null}
      {state === "done" ? <section className="assistant-answer" aria-live="polite"><small>KẾT QUẢ TỪ MÁY NHÀ</small><p>{answer}</p></section> : null}
      {state === "error" ? <p className="assistant-error" role="alert">Máy nhà chưa trả lời được lúc này. Dữ liệu vẫn an toàn; hãy chạm thử lại sau.</p> : null}
      <aside className="assistant-boundary"><strong>Riêng tư theo thiết kế</strong><p>Không gửi ghi chú, thời điểm chi tiết hoặc hồ sơ gốc cho mô hình AI.</p></aside>
    </main>
  );
}
