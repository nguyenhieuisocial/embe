"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import AppHeader from "../../components/app-header";
import HospitalBagChecklist from "../../components/hospital-bag-checklist";

type Preparation = {
  hospitalName: string;
  hospitalAddress: string;
  hospitalPhone: string;
  supportPhone: string;
  preferences: string;
  clinicianNotes: string;
};

type Contraction = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

const emptyPreparation: Preparation = {
  hospitalName: "",
  hospitalAddress: "",
  hospitalPhone: "",
  supportPhone: "",
  preferences: "",
  clinicianNotes: ""
};

function isPreparation(value: unknown): value is Preparation {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Object.keys(emptyPreparation).every((key) => typeof record[key] === "string");
}

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function BirthPrepPage() {
  const [preparation, setPreparation] = useState<Preparation>(emptyPreparation);
  const [events, setEvents] = useState<Contraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const active = events.find((event) => !event.ended_at);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [preparationResponse, contractionResponse] = await Promise.all([
          fetch("/api/birth-prep", { cache: "no-store", signal: controller.signal }),
          fetch("/api/birth-prep/contractions", { cache: "no-store", signal: controller.signal })
        ]);
        if (!preparationResponse.ok || !contractionResponse.ok) throw new Error("load_failed");
        const [savedPreparation, contractionData] = await Promise.all([
          preparationResponse.json(),
          contractionResponse.json()
        ]);
        if (!isPreparation(savedPreparation) || !Array.isArray(contractionData.events)) throw new Error("invalid_data");
        setPreparation(savedPreparation);
        setEvents(contractionData.events);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("Chưa tải được kế hoạch sinh. Hãy thử lại khi mạng ổn định.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active?.id]);

  const duration = active
    ? Math.max(0, Math.floor((now - new Date(active.started_at).getTime()) / 1000))
    : 0;

  const intervals = useMemo(() => events
    .filter((event) => event.ended_at)
    .slice(0, 6)
    .map((event, index, completed) => ({
      duration: Math.round((new Date(event.ended_at!).getTime() - new Date(event.started_at).getTime()) / 1000),
      interval: index < completed.length - 1
        ? Math.round((new Date(event.started_at).getTime() - new Date(completed[index + 1].started_at).getTime()) / 60000)
        : null
    })), [events]);
  const recentPattern = useMemo(() => {
    if (intervals.length < 2) return null;
    const averageDuration = Math.round(intervals.reduce((sum, entry) => sum + entry.duration, 0) / intervals.length);
    const knownIntervals = intervals.flatMap((entry) => entry.interval === null ? [] : [entry.interval]);
    const averageInterval = knownIntervals.length
      ? Math.round(knownIntervals.reduce((sum, value) => sum + value, 0) / knownIntervals.length)
      : null;
    return { averageDuration, averageInterval, count: intervals.length };
  }, [intervals]);

  function setField(field: keyof Preparation, value: string) {
    setPreparation((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const body = Object.fromEntries(
      Object.entries(preparation).map(([key, value]) => [key, value.trim()])
    ) as Preparation;

    try {
      const response = await fetch("/api/birth-prep", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("save_failed");
      const saved = await response.json();
      if (!isPreparation(saved)) throw new Error("invalid_data");
      setPreparation(saved);
      setMessage("Đã lưu kế hoạch sinh.");
    } catch {
      setMessage("Chưa lưu được kế hoạch sinh. Thông tin vẫn còn trên màn hình để thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleContraction() {
    if (busy || loading) return;
    setBusy(true);
    setMessage("");
    const id = active?.id ?? crypto.randomUUID();
    const time = new Date().toISOString();

    try {
      const response = await fetch("/api/birth-prep/contractions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: active ? "end" : "start", time })
      });
      if (!response.ok) throw new Error("save_failed");
      setEvents((current) => active
        ? current.map((event) => event.id === id ? { ...event, ended_at: time } : event)
        : [{ id, started_at: time, ended_at: null }, ...current]);
      setMessage(active ? "Đã lưu cơn gò." : "Đang ghi cơn gò.");
    } catch {
      setMessage("Chưa lưu được cơn gò. Hãy kiểm tra mạng rồi thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page birth-prep-page">
      <AppHeader note="Kế hoạch riêng của gia đình" />
      <header className="page-intro">
        <p className="panel-kicker">Chuẩn bị ngày gặp Bé</p>
        <h1>Sinh nở, gọn trong một nơi</h1>
        <p>Thông tin cần mở nhanh khi rời nhà hoặc đang theo dõi cơn gò.</p>
      </header>

      <section className="labor-card" aria-labelledby="labor-title">
        <p className="panel-kicker" id="labor-title">Chế độ chuyển dạ</p>
        <strong>{active ? clock(duration) : "Sẵn sàng khi cần"}</strong>
        <button type="button" disabled={busy || loading} onClick={() => void toggleContraction()}>
          {busy ? "Đang lưu…" : active ? "Kết thúc cơn gò" : "Bắt đầu cơn gò"}
        </button>
        {intervals.length ? (
          <div className="contraction-history" aria-label="Các cơn gò gần đây">
            {intervals.map((entry, index) => (
              <span key={`${events[index]?.id ?? index}-summary`}>
                <b>{entry.duration} giây</b>{entry.interval ? ` · cách ${entry.interval} phút` : ""}
              </span>
            ))}
          </div>
        ) : null}
        {recentPattern ? <div className="contraction-pattern">
          <span><small>Nhịp gần đây</small><strong>{recentPattern.count} cơn đã lưu</strong></span>
          <p>Trung bình {recentPattern.averageDuration} giây{recentPattern.averageInterval === null ? "" : ` · cách ${recentPattern.averageInterval} phút`}.</p>
        </div> : null}
        <small>Bộ đếm chỉ giúp ghi lại. Khi có dấu hiệu bất thường hoặc được cơ sở y tế hướng dẫn, hãy gọi nơi khám/cấp cứu.</small>
      </section>

      <aside className="labor-urgent" role="note">
        <strong>Không chờ bộ đếm khi có dấu hiệu khẩn.</strong>
        <p>Ra máu nhiều, rỉ hoặc vỡ ối, đau liên tục dữ dội, hoặc Bé cử động ít hơn bình thường: gọi nơi sinh/cấp cứu ngay.</p>
        <a href="https://www.acog.org/womens-health/faqs/how-to-tell-when-labor-begins" target="_blank" rel="noreferrer">Nguồn ACOG ↗</a>
      </aside>

      {message ? <p className="form-status" role="status">{message}</p> : null}

      <div className="birth-contact-actions">
        {preparation.hospitalPhone ? <a href={`tel:${preparation.hospitalPhone}`}>Gọi nơi sinh</a> : null}
        {preparation.supportPhone ? <a href={`tel:${preparation.supportPhone}`}>Gọi người hỗ trợ</a> : null}
        {preparation.hospitalAddress ? (
          <a href={`https://maps.apple.com/?q=${encodeURIComponent(preparation.hospitalAddress)}`} target="_blank" rel="noreferrer">Mở đường đi</a>
        ) : null}
      </div>

      <section className="section">
        <div className="section-head">
          <p className="panel-kicker">Thông tin cần mang theo</p>
          <h2>Kế hoạch sinh</h2>
        </div>
        <form className="medical-form" onSubmit={save}>
          <div className="medical-form-grid">
            <label>Nơi dự định sinh<input name="hospitalName" maxLength={160} value={preparation.hospitalName} onChange={(event) => setField("hospitalName", event.target.value)} /></label>
            <label>Điện thoại nơi sinh<input name="hospitalPhone" inputMode="tel" maxLength={30} value={preparation.hospitalPhone} onChange={(event) => setField("hospitalPhone", event.target.value)} /></label>
            <label className="medical-wide">Địa chỉ<input name="hospitalAddress" maxLength={300} value={preparation.hospitalAddress} onChange={(event) => setField("hospitalAddress", event.target.value)} /></label>
            <label>Người hỗ trợ<input name="supportPhone" inputMode="tel" maxLength={30} value={preparation.supportPhone} onChange={(event) => setField("supportPhone", event.target.value)} /></label>
          </div>
          <label>Mong muốn cần trao đổi<textarea name="preferences" rows={4} maxLength={3000} value={preparation.preferences} onChange={(event) => setField("preferences", event.target.value)} placeholder="Người đồng hành, da kề da, nuôi con bằng sữa mẹ… để trao đổi với cơ sở y tế" /></label>
          <label>Dặn dò của bác sĩ<textarea name="clinicianNotes" rows={4} maxLength={3000} value={preparation.clinicianNotes} onChange={(event) => setField("clinicianNotes", event.target.value)} /></label>
          <button className="health-save" disabled={busy || loading}>{busy ? "Đang lưu…" : "Lưu kế hoạch"}</button>
        </form>
      </section>

      <HospitalBagChecklist />

      <nav className="birth-prep-links" aria-label="Chuẩn bị liên quan">
        <a href="#gio-di-sinh">Kiểm tra giỏ đi sinh</a>
        <Link href="/ke-hoach">Việc cần hoàn tất</Link>
        <Link href="/do-dung">Đồ dùng trong nhà</Link>
      </nav>
    </main>
  );
}
