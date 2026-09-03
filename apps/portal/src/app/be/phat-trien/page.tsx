"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import AppHeader from "../../../components/app-header";
import BabyGrowthChart from "../../../components/baby-growth-chart";

type Growth = {
  id: string;
  measured_at: string;
  weight_g: number | null;
  length_cm: number | null;
  head_cm: number | null;
  provider: string;
  notes: string;
};

type Milestone = {
  id: string;
  observed_at: string;
  domain: string;
  title: string;
  notes: string;
  media_url: string;
  question_for_clinician: boolean;
};

type Lifecycle = {
  birthOccurredAt?: string | null;
  gestationalWeeks?: number | null;
  babySex?: "male" | "female" | null;
  premature?: boolean;
};

const domains: Record<string, string> = {
  movement: "Vận động",
  communication: "Giao tiếp",
  social: "Xã hội–cảm xúc",
  cognitive: "Nhận thức",
  other: "Khác"
};

function localDateTime(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDate(): string {
  return localDateTime().slice(0, 10);
}

export default function DevelopmentPage() {
  const [growth, setGrowth] = useState<Growth[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [birth, setBirth] = useState<Lifecycle>({});
  const [tab, setTab] = useState<"growth" | "milestone">("growth");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formKey, setFormKey] = useState(0);

  async function load(signal?: AbortSignal) {
    try {
      const [developmentResponse, lifecycleResponse] = await Promise.all([
        fetch("/api/baby/development", { cache: "no-store", signal }),
        fetch("/api/family/lifecycle", { cache: "no-store", signal })
      ]);
      if (!developmentResponse.ok || !lifecycleResponse.ok) throw new Error("load_failed");
      const [development, lifecycle] = await Promise.all([
        developmentResponse.json(),
        lifecycleResponse.json()
      ]);
      setGrowth(Array.isArray(development.growth) ? development.growth : []);
      setMilestones(Array.isArray(development.milestones) ? development.milestones : []);
      setBirth(lifecycle && typeof lifecycle === "object" ? lifecycle : {});
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Chưa tải được dữ liệu của Bé. Hãy thử lại khi mạng ổn định.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const age = useMemo(() => {
    if (!birth.birthOccurredAt) return null;
    const days = Math.max(0, Math.floor((Date.now() - new Date(birth.birthOccurredAt).getTime()) / 86_400_000));
    const earlyDays = Math.max(0, 40 - (birth.gestationalWeeks ?? 40)) * 7;
    return {
      actual: days,
      corrected: Math.max(0, days - earlyDays),
      useCorrected: earlyDays > 0 && days < 730
    };
  }, [birth]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const number = (key: string) => text(key) ? Number(text(key)) : null;

    if (tab === "growth" && ["weightG", "lengthCm", "headCm"].every((key) => !text(key))) {
      setMessage("Nhập ít nhất một số đo: cân nặng, chiều dài hoặc vòng đầu.");
      return;
    }

    const body = tab === "growth" ? {
      id: crypto.randomUUID(),
      type: "growth",
      measuredAt: new Date(text("measuredAt")).toISOString(),
      weightG: number("weightG"),
      lengthCm: number("lengthCm"),
      headCm: number("headCm"),
      provider: text("provider"),
      notes: text("notes")
    } : {
      id: crypto.randomUUID(),
      type: "milestone",
      observedAt: text("observedAt"),
      domain: text("domain"),
      title: text("title"),
      notes: text("notes"),
      mediaUrl: text("mediaUrl"),
      questionForClinician: Boolean(data.get("question"))
    };

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/baby/development", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("save_failed");
      setMessage(tab === "growth" ? "Đã lưu lần đo." : "Đã lưu cột mốc.");
      setFormKey((current) => current + 1);
      await load();
    } catch {
      setMessage("Chưa lưu được. Nội dung vẫn còn trên màn hình để thử lại.");
    } finally {
      setBusy(false);
    }
  }

  function chooseTab(next: "growth" | "milestone") {
    setTab(next);
    setMessage("");
    setFormKey((current) => current + 1);
  }

  return (
    <main className="page development-page">
      <AppHeader note="Theo dõi để trao đổi với bác sĩ" />
      <header className="page-intro">
        <p className="panel-kicker">Lớn lên từng ngày</p>
        <h1>Tăng trưởng & cột mốc</h1>
        {age ? (
          <p>{Math.floor(age.actual / 30.44)} tháng tuổi{age.useCorrected ? ` · tuổi hiệu chỉnh ${Math.floor(age.corrected / 30.44)} tháng` : ""}</p>
        ) : <p>Sẵn sàng sau khi gia đình lưu ngày sinh.</p>}
      </header>

      <div className="segment-control" aria-label="Chọn nội dung theo dõi">
        <button type="button" aria-pressed={tab === "growth"} onClick={() => chooseTab("growth")}>Tăng trưởng</button>
        <button type="button" aria-pressed={tab === "milestone"} onClick={() => chooseTab("milestone")}>Cột mốc</button>
      </div>

      <form className="section medical-form" key={`${tab}-${formKey}`} onSubmit={save}>
        {tab === "growth" ? (
          <>
            <h2>Thêm lần đo</h2>
            <div className="medical-form-grid">
              <label>Ngày đo<input name="measuredAt" type="datetime-local" defaultValue={localDateTime()} required /></label>
              <label>Cân nặng (g)<input name="weightG" type="number" inputMode="numeric" min={300} max={40000} /></label>
              <label>Chiều dài (cm)<input name="lengthCm" type="number" step=".1" inputMode="decimal" min={20} max={130} /></label>
              <label>Vòng đầu (cm)<input name="headCm" type="number" step=".1" inputMode="decimal" min={20} max={65} /></label>
              <label>Nơi đo<input name="provider" maxLength={160} /></label>
            </div>
          </>
        ) : (
          <>
            <h2>Thêm điều Bé vừa làm được</h2>
            <div className="medical-form-grid">
              <label>Ngày quan sát<input name="observedAt" type="date" defaultValue={localDate()} required /></label>
              <label>Nhóm<select name="domain">{Object.entries(domains).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
              <label className="medical-wide">Cột mốc<input name="title" required maxLength={160} /></label>
              <label className="medical-wide">Liên kết ảnh/video<input name="mediaUrl" type="url" maxLength={500} placeholder="Liên kết kỷ niệm nếu có" /></label>
            </div>
            <label className="check-line"><input name="question" type="checkbox" /> Đưa vào danh sách hỏi bác sĩ</label>
          </>
        )}
        <label>Ghi chú<textarea name="notes" rows={3} maxLength={1000} /></label>
        <button className="health-save" disabled={busy || loading}>{busy ? "Đang lưu…" : tab === "growth" ? "Lưu lần đo" : "Lưu cột mốc"}</button>
        {message ? <p className="form-status" role="status">{message}</p> : null}
      </form>

      {tab === "growth" ? (
        <>
          <BabyGrowthChart birthOccurredAt={birth.birthOccurredAt ?? null} babySex={birth.babySex ?? null} premature={birth.premature} growth={growth} />
          <section className="section">
            <h2>Các lần đo</h2>
            {growth.length ? (
              <div className="growth-table" role="table" aria-label="Lịch sử tăng trưởng">
                {growth.map((entry) => (
                  <article key={entry.id} role="row">
                    <time>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(entry.measured_at))}</time>
                    <span>{entry.weight_g ? `${(entry.weight_g / 1000).toFixed(2)} kg` : "—"}</span>
                    <span>{entry.length_cm ? `${entry.length_cm} cm` : "—"}</span>
                    <span>{entry.head_cm ? `${entry.head_cm} cm vòng đầu` : "—"}</span>
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">{loading ? "Đang tải các lần đo…" : "Chưa có lần đo nào."}</p>}
          </section>
        </>
      ) : (
        <section className="section">
          <h2>Dòng thời gian cột mốc</h2>
          {milestones.length ? (
            <div className="baby-medical-timeline">
              {milestones.map((milestone) => (
                <article key={milestone.id}>
                  <small>{domains[milestone.domain] ?? "Khác"} · {new Intl.DateTimeFormat("vi-VN").format(new Date(`${milestone.observed_at}T00:00:00`))}</small>
                  <strong>{milestone.title}</strong>
                  {milestone.notes ? <p>{milestone.notes}</p> : null}
                  {milestone.question_for_clinician ? <b>Cần hỏi bác sĩ</b> : null}
                  {milestone.media_url ? <a href={milestone.media_url}>Mở kỷ niệm liên quan</a> : null}
                </article>
              ))}
            </div>
          ) : <p className="empty-state">{loading ? "Đang tải cột mốc…" : "Chưa có cột mốc nào."}</p>}
        </section>
      )}

      <p className="form-boundary">Cột mốc có khoảng thời gian phát triển khác nhau. Nếu gia đình lo lắng hoặc Bé mất kỹ năng đã có, hãy trao đổi sớm với nhân viên y tế.</p>
    </main>
  );
}
