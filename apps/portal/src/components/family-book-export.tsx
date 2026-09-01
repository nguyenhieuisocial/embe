"use client";

import { useEffect, useMemo, useState } from "react";

import { calculatePregnancyWeek, localDateKey } from "../lib/pregnancy";
import type { MedicalRecord } from "../lib/pregnancy-medical";
import type { CarePlan, FamilyBookReport, HealthMetric } from "../lib/family-book-pdf";

const RANGE_OPTIONS = [7, 28, 90] as const;

function formatDay(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
}

function average(values: Array<number | null>): number | null {
  const recorded = values.filter((value): value is number => typeof value === "number");
  return recorded.length ? recorded.reduce((sum, value) => sum + value, 0) / recorded.length : null;
}

function valueOrDash(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${Number(value.toFixed(1))}${suffix}`;
}

async function readJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export default function FamilyBookExport() {
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(28);
  const [data, setData] = useState<FamilyBookReport | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let active = true;
    const day = localDateKey();
    setStatus("loading");
    void Promise.all([
      readJson(`/api/pregnancy?day=${day}`),
      readJson(`/api/pregnancy/health?end=${day}&days=${days}`),
      readJson(`/api/pregnancy/care?day=${day}`),
      readJson("/api/pregnancy/records")
    ]).then(([pregnancy, health, care, medical]) => {
      if (!active) return;
      if (!pregnancy && !health && !care && !medical) {
        setStatus("error");
        return;
      }
      const snapshot = care?.snapshot && typeof care.snapshot === "object"
        ? care.snapshot as Record<string, unknown>
        : null;
      const unavailable = [
        !pregnancy && "thai kỳ", !health && "sức khỏe", !care && "thuốc/vi chất", !medical && "hồ sơ khám"
      ].filter((item): item is string => Boolean(item));
      const rangeEnd = new Date(`${day}T23:59:59+07:00`).getTime();
      const rangeStart = rangeEnd - (days - 1) * 86_400_000;
      const records = Array.isArray(medical?.records) ? medical.records as MedicalRecord[] : [];
      setData({
        dueDate: typeof pregnancy?.dueDate === "string" ? pregnancy.dueDate : null,
        health: Array.isArray(health?.history) ? health.history as HealthMetric[] : [],
        records: records.filter((record) => {
          const occurredAt = new Date(record.occurredAt).getTime();
          return Number.isFinite(occurredAt) && occurredAt >= rangeStart && occurredAt <= rangeEnd;
        }),
        plans: Array.isArray(snapshot?.plans) ? (snapshot.plans as CarePlan[]).filter((plan) => plan.active) : [],
        unavailable
      });
      setStatus("ready");
    });
    return () => { active = false; };
  }, [days]);

  const summary = useMemo(() => {
    const health = (data?.health ?? []).filter((item) =>
      [item.weightKg, item.systolic, item.diastolic, item.sleepMinutes, item.waterGlasses, item.movementMinutes, item.wellbeing]
        .some((value) => value !== null)
    );
    const latest = health.at(-1) ?? null;
    return {
      health,
      latest,
      averageSleep: average(health.map((item) => item.sleepMinutes)),
      averageWater: average(health.map((item) => item.waterGlasses)),
      averageMovement: average(health.map((item) => item.movementMinutes))
    };
  }, [data]);

  const week = data?.dueDate ? calculatePregnancyWeek(data.dueDate) : null;
  const generatedAt = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "long", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date());

  async function downloadPdf(): Promise<void> {
    if (!data || status !== "ready") return;
    setPdfStatus("loading");
    try {
      const { downloadFamilyBookPdf } = await import("../lib/family-book-pdf");
      await downloadFamilyBookPdf({ data, days, generatedAt, week });
      setPdfStatus("idle");
    } catch {
      setPdfStatus("error");
    }
  }

  return (
    <section className="family-book-export" aria-labelledby="family-book-title">
      <div className="family-book-controls">
        <div>
          <p className="panel-kicker">Bản riêng của gia đình</p>
          <h1 id="family-book-title">Sổ Mẹ &amp; Bé</h1>
          <p>Gom dữ liệu đã ghi thành một bản sạch để lưu PDF hoặc in.</p>
        </div>
        <div className="family-book-range" role="group" aria-label="Khoảng thời gian xuất">
          {RANGE_OPTIONS.map((value) => <button key={value} aria-pressed={days === value} onClick={() => setDays(value)} type="button">{value} ngày</button>)}
        </div>
        <div className="family-book-actions">
          <button className="family-book-print" disabled={status !== "ready" || pdfStatus === "loading"} onClick={() => void downloadPdf()} type="button">
            <span aria-hidden="true">↓</span> {pdfStatus === "loading" ? "Đang tạo PDF…" : "Tải PDF"}
          </button>
          <button className="family-book-print is-secondary" disabled={status !== "ready"} onClick={() => window.print()} type="button">
            <span aria-hidden="true">▣</span> In
          </button>
        </div>
        <p className="family-book-print-help">Tải PDF để lưu hoặc gửi. Chọn In để dùng AirPrint ngay trên iPhone.</p>
        {pdfStatus === "error" ? <p className="family-book-warning" role="alert">Chưa tạo được PDF. Hãy thử lại; bản xem trước vẫn có thể in.</p> : null}
        {data?.unavailable.length ? <p className="family-book-warning" role="status">Tạm thiếu: {data.unavailable.join(", ")}. Bản in vẫn giữ các phần đã tải được.</p> : null}
      </div>

      {status === "loading" ? <div className="family-book-loading" role="status">Đang xếp dữ liệu vào sổ…</div> : null}
      {status === "error" ? <div className="family-book-loading is-error" role="alert">Chưa mở được dữ liệu. Hãy kiểm tra mạng và thử lại.</div> : null}

      {data && status === "ready" ? <article className="family-book-preview" aria-label="Bản xem trước Sổ Mẹ và Bé">
        <header className="family-book-cover">
          <p>Sổ theo dõi riêng của gia đình</p>
          <h2>Mẹ Ngân<br /><em>&amp; Em Bé</em></h2>
          <span>{days} ngày gần nhất</span>
          <small>Ba Hiếu cùng chăm sóc · Xuất {generatedAt}</small>
        </header>

        <section className="family-book-section">
          <div className="family-book-section-title"><span>01</span><div><p>Hành trình hiện tại</p><h2>Mẹ &amp; Bé hôm nay</h2></div></div>
          <div className="family-book-facts">
            <div><small>Tuần thai</small><strong>{week ?? "—"}</strong></div>
            <div><small>Ngày dự sinh</small><strong>{data.dueDate ? formatDay(data.dueDate) : "Chưa ghi"}</strong></div>
            <div><small>Hồ sơ khám</small><strong>{data.records.length}</strong></div>
            <div><small>Ngày có số liệu</small><strong>{summary.health.length}</strong></div>
          </div>
          <p className="family-book-note">Các con số dưới đây được chép từ dữ liệu gia đình đã nhập; EmBe không dùng chúng để chẩn đoán.</p>
        </section>

        <section className="family-book-section">
          <div className="family-book-section-title"><span>02</span><div><p>Nhật ký của Mẹ</p><h2>Sức khỏe đã ghi</h2></div></div>
          <div className="family-book-facts is-health">
            <div><small>Cân nặng gần nhất</small><strong>{valueOrDash(summary.latest?.weightKg ?? null, " kg")}</strong></div>
            <div><small>Ngủ trung bình</small><strong>{valueOrDash(summary.averageSleep === null ? null : summary.averageSleep / 60, " giờ")}</strong></div>
            <div><small>Nước trung bình</small><strong>{valueOrDash(summary.averageWater, " cốc")}</strong></div>
            <div><small>Vận động trung bình</small><strong>{valueOrDash(summary.averageMovement, " phút")}</strong></div>
          </div>
          {summary.health.length ? <div className="family-book-table-wrap"><table>
            <thead><tr><th>Ngày</th><th>Cân nặng</th><th>Huyết áp</th><th>Ngủ</th><th>Nước</th><th>Vận động</th><th>Checklist</th></tr></thead>
            <tbody>{summary.health.map((item) => <tr key={item.day}>
              <td>{formatDay(item.day)}</td><td>{valueOrDash(item.weightKg)}</td>
              <td>{item.systolic !== null && item.diastolic !== null ? `${item.systolic}/${item.diastolic}` : "—"}</td>
              <td>{item.sleepMinutes === null ? "—" : `${Number((item.sleepMinutes / 60).toFixed(1))}h`}</td>
              <td>{valueOrDash(item.waterGlasses)}</td><td>{valueOrDash(item.movementMinutes)}</td><td>{item.checklistPercent}%</td>
            </tr>)}</tbody>
          </table></div> : <p className="family-book-empty">Chưa có số liệu sức khỏe trong khoảng này.</p>}
        </section>

        <section className="family-book-section">
          <div className="family-book-section-title"><span>03</span><div><p>Theo dõi thai kỳ</p><h2>Khám thai &amp; thông tin của Bé</h2></div></div>
          {data.records.length ? <div className="family-book-records">{data.records.map((record) => <article key={record.id}>
            <div><span>{record.kind === "ultrasound" ? "Siêu âm" : record.kind === "laboratory" ? "Xét nghiệm" : record.kind === "prescription" ? "Đơn thuốc" : record.kind === "appointment" ? "Khám thai" : "Tài liệu"}</span><time dateTime={record.occurredAt}>{formatDay(record.occurredAt)}</time></div>
            <h3>{record.title}</h3>
            <p>{[record.gestationalWeek ? `Tuần ${record.gestationalWeek}` : "", record.provider, record.clinician].filter(Boolean).join(" · ") || "Không có thông tin bổ sung"}</p>
            {Object.keys(record.measurements).length ? <dl>{Object.entries(record.measurements).map(([key, value]) => <div key={key}><dt>{key === "fetalHeartRate" ? "Nhịp tim thai" : key === "weightKg" ? "Cân nặng" : key === "systolic" ? "Huyết áp trên" : key === "diastolic" ? "Huyết áp dưới" : key}</dt><dd>{value}</dd></div>)}</dl> : null}
            {record.medicines.length ? <ul>{record.medicines.map((medicine, index) => <li key={`${medicine.name}-${index}`}><strong>{medicine.name}</strong> {[medicine.dose, medicine.frequency, medicine.instructions].filter(Boolean).join(" · ")}</li>)}</ul> : null}
            {record.notes ? <blockquote>{record.notes}</blockquote> : null}
          </article>)}</div> : <p className="family-book-empty">Chưa có hồ sơ khám thai được lưu.</p>}
        </section>

        <section className="family-book-section">
          <div className="family-book-section-title"><span>04</span><div><p>Theo đúng điều đã được dặn</p><h2>Thuốc &amp; vi chất đang ghi</h2></div></div>
          {data.plans.length ? <div className="family-book-plans">{data.plans.map((plan) => <article key={plan.id}>
            <span>{plan.category === "medicine" ? "Thuốc" : "Vi chất"}{plan.confirmed_by_clinician ? " · đã xác nhận" : " · cần xác nhận lại"}</span>
            <h3>{plan.name}</h3><p>{plan.dose_display} · {plan.times_per_day} lần/ngày{plan.instructions ? ` · ${plan.instructions}` : ""}</p>
          </article>)}</div> : <p className="family-book-empty">Chưa có thuốc hoặc vi chất đang dùng được ghi trong EmBe.</p>}
          <footer>Chỉ dùng thuốc và vi chất theo hướng dẫn của bác sĩ hoặc dược sĩ. Sổ này dùng để xem lại, không thay thế đơn thuốc hay hồ sơ bệnh án.</footer>
        </section>
      </article> : null}
    </section>
  );
}
