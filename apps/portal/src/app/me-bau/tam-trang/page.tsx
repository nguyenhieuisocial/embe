"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import AppHeader from "../../../components/app-header";

const MOODS = [
  { value: 1, icon: "☁️", label: "Rất khó" },
  { value: 2, icon: "🌧️", label: "Khó" },
  { value: 3, icon: "🌤️", label: "Tạm ổn" },
  { value: 4, icon: "🌷", label: "Khá ổn" },
  { value: 5, icon: "☀️", label: "Dễ chịu" }
] as const;
const ANXIETY = [
  { value: 1, label: "Rất yên" },
  { value: 2, label: "Hơi lo" },
  { value: 3, label: "Khá lo" },
  { value: 4, label: "Lo nhiều" },
  { value: 5, label: "Rất khó dịu" }
] as const;
const FREQUENCIES = [
  [0, "Không ngày nào"], [1, "Vài ngày"], [2, "Hơn nửa số ngày"], [3, "Gần như mỗi ngày"]
] as const;

type Checkin = {
  id: string;
  occurredAt: string;
  mood: number;
  anxiety: number;
  note: string;
  phq2Interest: number | null;
  phq2Depressed: number | null;
  gad2Nervous: number | null;
  gad2Control: number | null;
  createdAt: string;
};

function localDateTime(date = new Date()): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function average(items: Checkin[], field: "mood" | "anxiety"): number | null {
  if (!items.length) return null;
  return Math.round(items.reduce((sum, item) => sum + item[field], 0) / items.length);
}

function recent(history: Checkin[], days: number, now = new Date()): Checkin[] {
  const earliest = now.getTime() - days * 24 * 60 * 60 * 1000;
  return history.filter((entry) => {
    const timestamp = new Date(entry.occurredAt).getTime();
    return timestamp >= earliest && timestamp <= now.getTime() + 5 * 60_000;
  });
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function Trend({ label, entries }: { label: string; entries: Checkin[] }) {
  const mood = average(entries, "mood");
  const anxiety = average(entries, "anxiety");
  return (
    <article className="mental-trend" aria-label={`Xu hướng ${label}`}>
      <span>{label}</span>
      <strong>{mood === null ? "Chưa đủ dữ liệu" : `${mood}/5`}</strong>
      <small>{anxiety === null ? "Ghi một lần để bắt đầu" : `Mức lo trung bình ${anxiety}/5 · ${entries.length} lần ghi`}</small>
    </article>
  );
}

function ScreeningSelect({ name, label }: { name: string; label: string }) {
  return (
    <label>{label}
      <select name={name} defaultValue="">
        <option value="">Chưa trả lời</option>
        {FREQUENCIES.map(([value, text]) => <option value={value} key={value}>{text}</option>)}
      </select>
    </label>
  );
}

export default function PregnancyMentalHealthPage() {
  const [history, setHistory] = useState<Checkin[]>([]);
  const [mood, setMood] = useState<number | null>(null);
  const [anxiety, setAnxiety] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/pregnancy/mental-health?days=28", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return await response.json() as { history: Checkin[] };
      })
      .then((payload) => { if (active) { setHistory(payload.history); setStatus("idle"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);

  const lastSevenDays = useMemo(() => recent(history, 7), [history]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mood === null || anxiety === null) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const optionalScore = (name: string): number | null => {
      const value = String(data.get(name) ?? "");
      return value === "" ? null : Number(value);
    };
    const phq2Interest = optionalScore("phq2Interest");
    const phq2Depressed = optionalScore("phq2Depressed");
    const gad2Nervous = optionalScore("gad2Nervous");
    const gad2Control = optionalScore("gad2Control");
    if ((phq2Interest === null) !== (phq2Depressed === null)
        || (gad2Nervous === null) !== (gad2Control === null)) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const response = await fetch("/api/pregnancy/mental-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          occurredAt: new Date(String(data.get("occurredAt"))).toISOString(),
          mood, anxiety, note: String(data.get("note") ?? ""),
          phq2Interest, phq2Depressed, gad2Nervous, gad2Control
        })
      });
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { checkin: Checkin };
      setHistory((current) => [payload.checkin, ...current]);
      setMood(null);
      setAnxiety(null);
      form.reset();
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="pregnancy-main mental-health-main">
      <AppHeader note="Riêng tư cho Ngân và Hiếu" />
      <header className="pregnancy-hero mental-hero">
        <p className="eyebrow">Một phút cho chính mình</p>
        <h1>Tâm trạng của Mẹ</h1>
        <p className="intro">Ghi cảm nhận nhẹ nhàng để nhìn lại và chia sẻ với người Mẹ tin tưởng khi cần.</p>
      </header>

      <a className="mental-relax-link" href="/me-bau/thu-gian"><span aria-hidden="true">◌</span><div><strong>Thở nhẹ 2–8 phút</strong><small>Một khoảng yên, không chấm điểm</small></div><b> Mở</b></a>

      <form className="section medical-form mental-checkin-form" onSubmit={(event) => void save(event)}>
        <div className="section-head"><h2>Hôm nay Mẹ thấy thế nào?</h2></div>
        <label>Thời điểm<input name="occurredAt" type="datetime-local" required defaultValue={localDateTime()} /></label>

        <fieldset className="mental-choice-grid">
          <legend>Cảm nhận chung</legend>
          <div>{MOODS.map((option) => <button
            type="button" key={option.value} aria-pressed={mood === option.value}
            aria-label={option.label} onClick={() => setMood(option.value)}
          ><span aria-hidden="true">{option.icon}</span><small>{option.label}</small></button>)}</div>
        </fieldset>

        <fieldset className="mental-choice-grid is-anxiety">
          <legend>Mức lo lắng</legend>
          <div>{ANXIETY.map((option) => <button
            type="button" key={option.value} aria-pressed={anxiety === option.value}
            aria-label={option.label} onClick={() => setAnxiety(option.value)}
          ><strong>{option.value}</strong><small>{option.label}</small></button>)}</div>
        </fieldset>

        <label className="health-note">Điều Mẹ muốn lưu lại
          <textarea name="note" rows={2} maxLength={500} placeholder="Một điều làm Mẹ vui, lo hoặc cần được giúp…" />
        </label>

        <details className="mental-screening">
          <summary><span><strong>Bộ câu hỏi PHQ-2 &amp; GAD-2 (tự chọn)</strong><small>Chỉ mở khi Mẹ chủ động muốn làm</small></span><i aria-hidden="true">⌄</i></summary>
          <div>
            <p>Trong 2 tuần qua, những điều sau xuất hiện thường xuyên thế nào?</p>
            <h3>PHQ-2</h3>
            <ScreeningSelect name="phq2Interest" label="Ít hứng thú hoặc ít niềm vui khi làm mọi việc" />
            <ScreeningSelect name="phq2Depressed" label="Cảm thấy buồn, chán nản hoặc vô vọng" />
            <h3>GAD-2</h3>
            <ScreeningSelect name="gad2Nervous" label="Cảm thấy lo lắng, bồn chồn hoặc căng thẳng" />
            <ScreeningSelect name="gad2Control" label="Không thể dừng hoặc kiểm soát lo lắng" />
            <p className="field-hint">Đây chỉ là sàng lọc ngắn, không phải chẩn đoán. Kết quả không thay thế trao đổi với bác sĩ hoặc chuyên gia sức khỏe tâm thần.</p>
          </div>
        </details>

        <button className="health-save" type="submit" disabled={mood === null || anxiety === null || status === "saving"}>
          {status === "saving" ? "Đang lưu…" : "Lưu cảm nhận"}
        </button>
      </form>

      <section className="section mental-trends" aria-labelledby="mental-trends-title">
        <div className="section-head"><p className="panel-kicker">Nhìn lại nhẹ nhàng</p><h2 id="mental-trends-title">Xu hướng gần đây</h2></div>
        <div><Trend label="7 ngày" entries={lastSevenDays} /><Trend label="28 ngày" entries={history} /></div>
        <p>Xu hướng chỉ giúp Mẹ nhận ra thay đổi để trao đổi, không tự kết luận sức khỏe.</p>
      </section>

      <details className="section mental-history" open={history.length > 0}>
        <summary><span><strong>Lịch sử đã lưu</strong><small>{history.length ? `${history.length} lần gần đây` : "Chưa có lần ghi nào"}</small></span><i aria-hidden="true">⌄</i></summary>
        <div>{history.map((entry) => {
          const phq = entry.phq2Interest !== null && entry.phq2Depressed !== null ? entry.phq2Interest + entry.phq2Depressed : null;
          const gad = entry.gad2Nervous !== null && entry.gad2Control !== null ? entry.gad2Nervous + entry.gad2Control : null;
          return <article key={entry.id}>
            <div><strong>{MOODS.find((item) => item.value === entry.mood)?.label ?? "Đã ghi"}</strong><time dateTime={entry.occurredAt}>{displayDate(entry.occurredAt)}</time></div>
            <small>Mức lo {entry.anxiety}/5</small>
            {entry.note ? <p>{entry.note}</p> : null}
            {phq !== null || gad !== null ? <details><summary>Xem sàng lọc đã lưu</summary><p>{phq !== null ? `PHQ-2: ${phq}/6` : ""}{phq !== null && gad !== null ? " · " : ""}{gad !== null ? `GAD-2: ${gad}/6` : ""}. Điểm số không phải chẩn đoán; nếu từ 3 trở lên hoặc Mẹ vẫn lo, hãy trao đổi với người chăm sóc sức khỏe.</p></details> : null}
          </article>;
        })}</div>
      </details>

      <aside className="mental-urgent" aria-labelledby="mental-urgent-title">
        <details>
          <summary id="mental-urgent-title">Mẹ cần hỗ trợ ngay?</summary>
          <div>
            <p>Nếu Mẹ nghĩ đến làm hại bản thân hoặc em bé, cảm thấy không an toàn, hãy ở cùng một người tin cậy và gọi trợ giúp ngay.</p>
            <a href="tel:115" aria-label="Gọi 115">Gọi 115</a>
          </div>
        </details>
      </aside>

      <p className={`state-note${status === "error" ? " is-wait" : ""}`} role="status">
        {status === "loading" ? "Đang mở lịch sử…" : status === "saving" ? "Đang lưu…" : status === "saved" ? "Đã lưu" : status === "error" ? "Chưa lưu được. Nếu đã mở bộ câu hỏi, hãy trả lời đủ từng cặp rồi thử lại." : "Dữ liệu được giữ riêng cho gia đình."}
      </p>
    </main>
  );
}
