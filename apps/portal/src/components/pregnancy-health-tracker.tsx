"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { localDateKey } from "../lib/pregnancy";
import type { PregnancyHealthMetric } from "./pregnancy-health-charts";

const PregnancyHealthCharts = dynamic(() => import("./pregnancy-health-charts"), {
  ssr: false,
  loading: () => <p className="health-chart-loading">Đang mở biểu đồ…</p>
});

type FormState = {
  weightKg: string;
  systolic: string;
  diastolic: string;
  sleepHours: string;
  waterGlasses: string;
  movementMinutes: string;
  wellbeing: number | null;
  bloodGlucoseMgDl: string;
  fetalMovementCount: string;
  symptoms: string[];
};

const EMPTY_FORM: FormState = {
  weightKg: "",
  systolic: "",
  diastolic: "",
  sleepHours: "",
  waterGlasses: "",
  movementMinutes: "",
  wellbeing: null,
  bloodGlucoseMgDl: "",
  fetalMovementCount: "",
  symptoms: []
};

const symptomOptions = [
  ["bleeding", "Ra máu"], ["severe_abdominal_pain", "Đau bụng nhiều"],
  ["severe_headache", "Đau đầu nhiều"], ["vision_change", "Nhìn mờ / thay đổi thị lực"],
  ["sudden_swelling", "Phù xuất hiện nhanh"], ["fever", "Sốt"],
  ["fluid_leak", "Nghi rỉ ối"], ["reduced_fetal_movement", "Thai máy giảm"],
  ["persistent_vomiting", "Nôn kéo dài"], ["other", "Dấu hiệu khác"]
] as const;

const wellbeingOptions = [
  { value: 1, label: "Rất mệt", emoji: "😣" },
  { value: 2, label: "Mệt", emoji: "😕" },
  { value: 3, label: "Bình thường", emoji: "😐" },
  { value: 4, label: "Khá ổn", emoji: "🙂" },
  { value: 5, label: "Rất tốt", emoji: "😊" }
] as const;

function inputNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricHasValues(metric: PregnancyHealthMetric): boolean {
  const hasNumber = [
    metric.weightKg,
    metric.systolic,
    metric.diastolic,
    metric.sleepMinutes,
    metric.waterGlasses,
    metric.movementMinutes,
    metric.wellbeing,
    metric.bloodGlucoseMgDl,
    metric.fetalMovementCount
  ].some((value) => typeof value === "number");
  return hasNumber || (metric.symptoms?.length ?? 0) > 0;
}

function metricToForm(metric: PregnancyHealthMetric | undefined): FormState {
  if (!metric) return EMPTY_FORM;
  return {
    weightKg: metric.weightKg?.toString() ?? "",
    systolic: metric.systolic?.toString() ?? "",
    diastolic: metric.diastolic?.toString() ?? "",
    sleepHours: metric.sleepMinutes === null ? "" : String(metric.sleepMinutes / 60),
    waterGlasses: metric.waterGlasses?.toString() ?? "",
    movementMinutes: metric.movementMinutes?.toString() ?? "",
    wellbeing: metric.wellbeing,
    bloodGlucoseMgDl: metric.bloodGlucoseMgDl?.toString() ?? "",
    fetalMovementCount: metric.fetalMovementCount?.toString() ?? "",
    symptoms: metric.symptoms ?? []
  };
}

export default function PregnancyHealthTracker({ pregnancyWeek = null }: { pregnancyWeek?: number | null }) {
  const [today, setToday] = useState("");
  const [history, setHistory] = useState<PregnancyHealthMetric[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "invalid" | "error">("loading");
  const dirtyRef = useRef(false);

  useEffect(() => {
    const day = localDateKey();
    setToday(day);
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/pregnancy/health?end=${day}&days=28`, { cache: "no-store" });
        if (!response.ok) throw new Error("health unavailable");
        const payload = await response.json() as { history?: PregnancyHealthMetric[] };
        if (!active || !Array.isArray(payload.history)) return;
        setHistory(payload.history);
        if (!dirtyRef.current) {
          setForm(metricToForm(payload.history.find((metric) => metric.day === day)));
        }
        setStatus("idle");
      } catch {
        if (active) setStatus("error");
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const hasHealthValues = useMemo(() => history.some(metricHasValues), [history]);

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    dirtyRef.current = true;
    setForm((current) => ({ ...current, [key]: value }));
    if (status === "saved" || status === "invalid") setStatus("idle");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!today || status === "saving") return;
    setStatus("saving");
    const sleepHours = inputNumber(form.sleepHours);
    const body = {
      day: today,
      weightKg: inputNumber(form.weightKg),
      systolic: inputNumber(form.systolic),
      diastolic: inputNumber(form.diastolic),
      sleepMinutes: sleepHours === null ? null : Math.round(sleepHours * 60),
      waterGlasses: inputNumber(form.waterGlasses),
      movementMinutes: inputNumber(form.movementMinutes),
      wellbeing: form.wellbeing,
      bloodGlucoseMgDl: inputNumber(form.bloodGlucoseMgDl),
      fetalMovementCount: inputNumber(form.fetalMovementCount),
      symptoms: form.symptoms
    };
    try {
      const response = await fetch("/api/pregnancy/health", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.status === 400) {
        setStatus("invalid");
        return;
      }
      if (!response.ok) throw new Error("health save unavailable");
      const payload = await response.json() as { metric?: PregnancyHealthMetric };
      if (!payload.metric) throw new Error("health save malformed");
      setHistory((current) => {
        const next = current.filter((metric) => metric.day !== payload.metric?.day);
        return [...next, payload.metric as PregnancyHealthMetric].sort((a, b) => a.day.localeCompare(b.day));
      });
      dirtyRef.current = false;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="health-tracker" aria-labelledby="health-title">
      <div className="section-heading-row">
        <div>
          <p className="panel-kicker">Ghi nhanh · chỉ số thực</p>
          <h2 id="health-title">Nhật ký sức khỏe</h2>
        </div>
        <p>Chỉ nhập số Mẹ Ngân thực sự đo hoặc nhớ được. Để trống mục chưa có; EmBe không tự chẩn đoán.</p>
      </div>

      <form className="health-entry-card" onSubmit={(event) => void save(event)}>
        <div className="health-fields">
          <label>Cân nặng (kg)<input inputMode="decimal" min="25" max="300" step="0.1" type="number" value={form.weightKg} onChange={(event) => setField("weightKg", event.target.value)} /></label>
          <fieldset className="pressure-fields">
            <legend>Huyết áp (mmHg)</legend>
            <label>Tâm thu<span className="sr-only">Huyết áp </span><input aria-label="Huyết áp tâm thu" inputMode="numeric" min="60" max="250" type="number" value={form.systolic} onChange={(event) => setField("systolic", event.target.value)} /></label>
            <label>Tâm trương<span className="sr-only">Huyết áp </span><input aria-label="Huyết áp tâm trương" inputMode="numeric" min="30" max="160" type="number" value={form.diastolic} onChange={(event) => setField("diastolic", event.target.value)} /></label>
          </fieldset>
          <label>Giấc ngủ (giờ)<input inputMode="decimal" min="0" max="24" step="0.5" type="number" value={form.sleepHours} onChange={(event) => setField("sleepHours", event.target.value)} /></label>
          <label>Số cốc nước<input inputMode="numeric" min="0" max="30" type="number" value={form.waterGlasses} onChange={(event) => setField("waterGlasses", event.target.value)} /></label>
          <label>Vận động (phút)<input inputMode="numeric" min="0" max="600" type="number" value={form.movementMinutes} onChange={(event) => setField("movementMinutes", event.target.value)} /></label>
          <label>Đường huyết (mg/dL)<input aria-label="Đường huyết (mg/dL)" inputMode="decimal" min="20" max="600" step="0.1" type="number" value={form.bloodGlucoseMgDl} onChange={(event) => setField("bloodGlucoseMgDl", event.target.value)} /></label>
          {pregnancyWeek === null || pregnancyWeek >= 16
            ? <label>Số cử động thai<input inputMode="numeric" min="0" max="500" type="number" value={form.fetalMovementCount} onChange={(event) => setField("fetalMovementCount", event.target.value)} /></label>
            : <p className="stage-field-note">Mục cử động thai sẽ hiện ở giai đoạn phù hợp hơn.</p>}
        </div>

        <fieldset className="symptom-picker">
          <legend>Dấu hiệu cần ghi lại</legend>
          <div>{symptomOptions.map(([value, label]) => <label key={value}>
            <input type="checkbox" checked={form.symptoms.includes(value)} onChange={(event) => setField("symptoms", event.target.checked
              ? [...form.symptoms, value] : form.symptoms.filter((item) => item !== value))} />
            <span>{label}</span>
          </label>)}</div>
          <p>Nếu có dấu hiệu đáng lo, liên hệ cơ sở y tế; việc đánh dấu chỉ để lưu lại, không thay thế đánh giá của bác sĩ.</p>
        </fieldset>

        <fieldset className="wellbeing-picker">
          <legend>Hôm nay Mẹ cảm thấy thế nào?</legend>
          <div>
            {wellbeingOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={form.wellbeing === option.value}
                aria-label={option.label}
                onClick={() => setField("wellbeing", option.value)}
              >
                <span aria-hidden="true">{option.emoji}</span>
                <small>{option.label}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <button className="health-save" type="submit" disabled={!today || status === "saving"}>
          {status === "saving" ? "Đang lưu…" : "Lưu sức khỏe hôm nay"}
        </button>
        <p className={`health-save-state is-${status}`} aria-live="polite">
          {status === "saved"
            ? "Đã lưu riêng tư."
            : status === "invalid"
              ? "Có một số chưa đúng khoảng cho phép. Hãy kiểm tra trường được đánh dấu."
              : status === "error"
                ? "Chưa kết nối được. Số vừa nhập vẫn còn trên màn hình để thử lại."
                : "Không bắt buộc nhập đủ mọi mục."}
        </p>
      </form>

      <div className="health-chart-heading">
        <div>
          <p className="panel-kicker">Xu hướng · không phải chẩn đoán</p>
          <h2>Biểu đồ 28 ngày</h2>
        </div>
        <span>Vuốt ngang để xem</span>
      </div>
      {hasHealthValues ? (
        <PregnancyHealthCharts history={history} />
      ) : (
        <div className="health-empty">
          <strong>Chưa có số liệu sức khỏe</strong>
          <p>Ghi một mục ở trên; biểu đồ sẽ bắt đầu từ số liệu thật đầu tiên.</p>
        </div>
      )}
    </section>
  );
}
