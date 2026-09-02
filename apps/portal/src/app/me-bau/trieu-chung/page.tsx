"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import AppHeader from "../../../components/app-header";
import { urgentCareReminders } from "../../../lib/pregnancy-content";

const SYMPTOM_OPTIONS = [
  ["bleeding", "Ra máu"], ["severe_abdominal_pain", "Đau bụng nhiều"],
  ["severe_headache", "Đau đầu nhiều"], ["vision_change", "Nhìn mờ / thay đổi thị lực"],
  ["sudden_swelling", "Phù xuất hiện nhanh"], ["fever", "Sốt"],
  ["fluid_leak", "Nghi rỉ ối"], ["reduced_fetal_movement", "Thai máy giảm — chỉ khi nơi khám đã hướng dẫn theo dõi"],
  ["persistent_vomiting", "Nôn kéo dài"], ["other", "Dấu hiệu khác"]
] as const;
const URGENT = new Set<string>(SYMPTOM_OPTIONS.filter(([id]) => id !== "other").map(([id]) => id));
const LABELS = new Map<string, string>(SYMPTOM_OPTIONS);
const SEVERITY_LABELS: Record<string, string> = { mild: "Nhẹ", moderate: "Vừa", severe: "Nặng" };
const MOOD_LABELS: Record<string, string> = { difficult: "Khó khăn", mixed: "Lẫn lộn", okay: "Tạm ổn", good: "Khá ổn" };
const WORRY_LABELS: Record<string, string> = { none: "Không", some: "Có đôi lúc", hard_to_manage: "Khó tự dịu lại" };

type Entry = {
  id: string; occurredAt: string; symptoms: string[]; severity: string; status: string;
  mood: string | null; worry: string | null; mentalNote: string; notes: string; createdAt: string;
};
type Contact = { id: string; kind: string; name: string; phone: string; primary: boolean };

function localDateTime(date = new Date()): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

export default function PregnancySymptomsPage() {
  const [history, setHistory] = useState<Entry[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const urgentSelected = useMemo(() => selected.some((item) => URGENT.has(item)), [selected]);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      fetch("/api/pregnancy/symptoms?limit=30", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return await response.json() as { history: Entry[] };
      }),
      fetch("/api/pregnancy/profile", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return await response.json() as { profile: { contacts?: Contact[] } };
      })
    ]).then(([journal, profile]) => {
      if (!active) return;
      if (journal.status === "fulfilled") { setHistory(journal.value.history); setStatus("idle"); }
      else setStatus("error");
      if (profile.status === "fulfilled") setContacts(profile.value.profile.contacts ?? []);
    });
    return () => { active = false; };
  }, []);

  function toggleSymptom(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("saving");
    try {
      const response = await fetch("/api/pregnancy/symptoms", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          occurredAt: new Date(String(data.get("occurredAt"))).toISOString(), symptoms: selected,
          severity: data.get("severity"), status: data.get("entryStatus"),
          mood: data.get("mood") || null, worry: data.get("worry") || null,
          mentalNote: String(data.get("mentalNote") ?? ""), notes: String(data.get("notes") ?? "")
        })
      });
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { entry: Entry };
      setHistory((current) => [payload.entry, ...current]);
      setSelected([]);
      form.reset();
      setStatus("saved");
    } catch { setStatus("error"); }
  }

  async function resolveEntry(id: string) {
    setResolvingId(id);
    try {
      const response = await fetch("/api/pregnancy/symptoms", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: "resolved" })
      });
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { entry: Entry };
      setHistory((current) => current.map((entry) => entry.id === id ? payload.entry : entry));
      setStatus("saved");
    } catch { setStatus("error"); }
    finally { setResolvingId(null); }
  }

  const callContacts = contacts.filter((contact) => contact.phone
    && (contact.primary || ["doctor", "clinic", "hospital", "emergency"].includes(contact.kind))).slice(0, 3);

  return (
    <main className="pregnancy-main">
      <AppHeader note="Chỉ Ngân và Hiếu xem được" />
      <header className="pregnancy-hero">
        <p className="eyebrow">Ghi để nhớ và trao đổi khi cần</p>
        <h1>Triệu chứng &amp; tâm trạng</h1>
        <p className="intro">Một lần ghi ngắn về điều Mẹ đang cảm thấy.</p>
      </header>

      <form className="section medical-form" onSubmit={(event) => void save(event)}>
        <div className="section-head"><h2>Ghi một lần</h2></div>
        <label>Thời điểm<input name="occurredAt" type="datetime-local" required defaultValue={localDateTime()} /></label>
        <fieldset className="symptom-picker">
          <legend>Dấu hiệu đang có</legend>
          <div>{SYMPTOM_OPTIONS.map(([id, label]) => <label key={id}>
            <input type="checkbox" checked={selected.includes(id)} onChange={() => toggleSymptom(id)} aria-label={label} />
            <span>{label}</span>
          </label>)}</div>
          <p>Việc đánh dấu chỉ giúp lưu lại, không thay thế đánh giá của bác sĩ.</p>
        </fieldset>

        {urgentSelected ? <aside className="urgent-care" role="alert">
          <p className="panel-kicker">Không chờ EmBe</p>
          <h2>Liên hệ ngay khi cần</h2>
          <p>Nếu thấy tình trạng nguy hiểm, liên hệ cơ sở sản khoa đang theo dõi hoặc gọi cấp cứu.</p>
          <ul>{urgentCareReminders.map((item) => <li key={item}>{item}</li>)}</ul>
          <div className="birth-contact-actions">
            <a href="tel:115" aria-label="Gọi 115">Gọi 115</a>
            {callContacts.map((contact) => <a href={`tel:${contact.phone}`} aria-label={`Gọi ${contact.name}`} key={contact.id}>Gọi {contact.name}</a>)}
          </div>
        </aside> : null}

        <fieldset className="symptom-picker">
          <legend>Mức độ</legend>
          <div>{Object.entries(SEVERITY_LABELS).map(([value, label]) => <label key={value}>
            <input name="severity" type="radio" value={value} defaultChecked={value === "mild"} aria-label={`Mức ${label.toLowerCase()}`} />
            <span>{label}</span>
          </label>)}</div>
        </fieldset>
        <label>Trạng thái<select name="entryStatus" defaultValue="tracking"><option value="tracking">Đang theo dõi</option><option value="resolved">Đã hết</option></select></label>

        <details className="medical-measurements">
          <summary>Tâm trạng hôm nay <span aria-hidden="true">⌄</span></summary>
          <div>
            <label>Tâm trạng<select name="mood" defaultValue=""><option value="">Chưa ghi</option>{Object.entries(MOOD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Mức lo lắng<select name="worry" defaultValue=""><option value="">Chưa ghi</option>{Object.entries(WORRY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          </div>
          <label className="health-note">Điều Mẹ muốn nhớ<textarea name="mentalNote" rows={2} maxLength={500} /></label>
          <p className="field-hint">EmBe chỉ lưu cảm nhận của Mẹ, không tự diễn giải kết quả.</p>
        </details>
        <label className="health-note">Ghi chú triệu chứng<textarea name="notes" rows={3} maxLength={1000} placeholder="Ví dụ: bắt đầu lúc nào, thay đổi ra sao…" /></label>
        <button className="health-save" type="submit" disabled={!selected.length || status === "saving"}>{status === "saving" ? "Đang lưu…" : "Lưu lần ghi"}</button>
      </form>

      <section className="section" aria-labelledby="symptom-history-title" aria-busy={status === "loading"}>
        <div className="section-head"><p className="panel-kicker">Mới nhất trước</p><h2 id="symptom-history-title">Lịch sử đã lưu</h2></div>
        {status === "loading" ? <div className="skeleton" role="status" aria-label="Đang mở lịch sử"><span className="skeleton-line" /><span className="skeleton-line is-short" /></div>
          : history.length ? <div className="medical-timeline">{history.map((entry) => <article key={entry.id}>
            <div className="medical-record-head"><span>{SEVERITY_LABELS[entry.severity]} · {entry.status === "resolved" ? "đã hết" : "đang theo dõi"}</span></div>
            <strong>Đã ghi: {entry.symptoms.map((item) => LABELS.get(item) ?? item).join(", ")}</strong>
            <time dateTime={entry.occurredAt}>{displayDate(entry.occurredAt)}</time>
            {(entry.mood || entry.worry) ? <p>{entry.mood ? `Tâm trạng: ${MOOD_LABELS[entry.mood]}` : ""}{entry.mood && entry.worry ? " · " : ""}{entry.worry ? `Lo lắng: ${WORRY_LABELS[entry.worry]}` : ""}</p> : null}
            {entry.mentalNote ? <p>{entry.mentalNote}</p> : null}{entry.notes ? <p>{entry.notes}</p> : null}
            {entry.status === "tracking" ? <button className="health-save" type="button" disabled={resolvingId === entry.id} onClick={() => void resolveEntry(entry.id)}>
              {resolvingId === entry.id ? "Đang cập nhật…" : "Đánh dấu đã hết"}
            </button> : null}
          </article>)}</div> : <p className="today-priority-empty">Chưa có lần ghi nào.</p>}
      </section>
      <p className={`state-note${status === "error" ? " is-wait" : ""}`} role="status">
        {status === "saving" ? "Đang lưu…" : status === "saved" ? "Đã lưu" : status === "error" ? "Chưa tải hoặc lưu được. Thử lại khi có mạng." : "Dữ liệu được giữ riêng cho gia đình."}
      </p>
    </main>
  );
}
