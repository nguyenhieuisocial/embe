"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  APPOINTMENT_CHECKLIST,
  decodeAppointmentWorkspace,
  encodeAppointmentWorkspace,
  medicalInsights,
  type MedicalMedicine,
  type MedicalRecord
} from "../lib/pregnancy-medical";
import { uploadDocument } from "../lib/medical-upload-client";
import MedicalDocumentIntake from './medical-document-intake';
import MedicalDocumentButton from './medical-document-viewer';
import type { MedicationScanMedicine } from "../lib/medication-scan-contract";
import { cachedPrivateGet, clearPrivateGetCache } from "../lib/private-get-cache";
import { MEDICAL_MEASUREMENTS, medicalMeasurementSeries } from "../lib/medical-measurements";

const kinds: Record<string, string> = {
  appointment: "Khám thai", ultrasound: "Siêu âm", laboratory: "Xét nghiệm",
  prescription: "Đơn thuốc", receipt: "Phiếu thu", clinical: "Bệnh án", discharge: "Giấy ra viện", other: "Tài liệu khác"
};

function localDateTime(date = new Date()): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function optionalNumber(data: FormData, key: string): number | null {
  const value = String(data.get(key) ?? "").trim();
  return value && Number.isFinite(Number(value)) ? Number(value) : null;
}

type MedicationScan = {
  documentId: string;
  medicines: MedicationScanMedicine[];
  questions: string[];
  status: "queued" | "processing" | "review" | "saving" | "confirmed" | "failed";
};

const emptyMedicine = (): MedicalMedicine => ({ name: "", ingredients: "", dose: "", frequency: "", instructions: "" });

function MeasurementHistory({ records }: { records: MedicalRecord[] }) {
  const [key, setKey] = useState<string>("");
  const available = MEDICAL_MEASUREMENTS.filter(metric => medicalMeasurementSeries(records, metric.key).length);
  const metric = available.find(item => item.key === key) ?? available[0];
  if (!metric) return null;
  const series = medicalMeasurementSeries(records, metric.key);
  return <details className="medical-measurements"><summary>Diễn biến chỉ số đã lưu</summary>
    <label>Chỉ số<select value={metric.key} onChange={e => setKey(e.target.value)}>{available.map(item => <option key={item.key} value={item.key}>{item.label} ({item.unit})</option>)}</select></label>
    <p>Chỉ so sánh cùng chỉ số và đơn vị. Khác thời điểm / phương pháp có thể khác kết quả; EmBe không tự đánh giá bình thường hay bất thường.</p>
    <ol>{series.map(point => <li key={point.id}><strong>{point.value} {metric.unit}</strong> · {point.dateOnly ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'long' }).format(new Date(point.at)) : displayDate(point.at)}{point.week ? ` · tuần ${point.week}` : ""}{point.provider ? ` · ${point.provider}` : ""}</li>)}</ol>
  </details>;
}

export default function PregnancyMedicalRecords() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState("appointment");
  const [medicines, setMedicines] = useState<MedicalMedicine[]>([emptyMedicine()]);
  const [medicationScans, setMedicationScans] = useState<MedicationScan[]>([]);
  const [filter, setFilter] = useState("all");
  const [formMode, setFormMode] = useState<"new" | "prepare" | "outcome">("new");
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [measurementsReviewed, setMeasurementsReviewed] = useState(false);
  const [measurementError, setMeasurementError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const pollingScans = useRef(new Set<string>());
  const saveLock = useRef(false);
  const recordId = useRef<string | null>(null);
  const documentAttempts = useRef(new Map<File, { id: string; result?: { documentId: string; mimeType: string } }>());
  const openedRecordHash = useRef("");

  useEffect(() => {
    const openLinkedRecord = () => {
      const hash = window.location.hash;
      if (!/^#record-[0-9a-f-]{36}$/i.test(hash) || openedRecordHash.current === hash) return;
      if (!records.some(record => `#record-${record.id}` === hash)) return;
      setFilter("all");
      requestAnimationFrame(() => {
        const target = document.getElementById(hash.slice(1));
        if (target) { target.scrollIntoView?.({ block: "center" }); openedRecordHash.current = hash; }
      });
    };
    openLinkedRecord(); window.addEventListener("hashchange", openLinkedRecord);
    return () => window.removeEventListener("hashchange", openLinkedRecord);
  }, [records]);

  async function load() {
    try {
      const response = await cachedPrivateGet("/api/pregnancy/records");
      if (!response.ok) throw new Error("records unavailable");
      const payload = await response.json() as { records?: MedicalRecord[] };
      const nextRecords = payload.records ?? [];
      setRecords(nextRecords); setStatus("idle");
      void restoreMedicationScans(nextRecords);
    } catch { setStatus("error"); }
  }

  useEffect(() => {
    const quick = new URLSearchParams(window.location.search).get("quick");
    if (quick === "appointment" || quick === "prescription") {
      setKind(quick === "prescription" ? "prescription" : "appointment");
      setShowForm(true);
    }
    void load();
  }, []);
  const insights = useMemo(() => medicalInsights(records), [records]);
  const visibleRecords = filter === "all" ? records : records.filter((record) => record.kind === filter);
  const appointmentWorkspace = decodeAppointmentWorkspace(editingRecord?.notes ?? "");

  function openForm(mode: "new" | "prepare" | "outcome", record: MedicalRecord | null = null) {
    if (saveLock.current) return;
    recordId.current = record?.id ?? crypto.randomUUID(); documentAttempts.current.clear();
    setMeasurementsReviewed(false); setMeasurementError("");
    setFormMode(mode); setEditingRecord(record); setKind(record?.kind ?? "appointment");
    setMedicines(record?.kind === "prescription" && record.medicines.length
      ? record.medicines.map((medicine) => ({ ...medicine })) : [emptyMedicine()]);
    setShowForm(true);
    requestAnimationFrame(() => {
      const form = document.getElementById("medical-record-form");
      if (typeof form?.scrollIntoView === "function") form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function updateMedicationScan(documentId: string, update: (scan: MedicationScan) => MedicationScan) {
    setMedicationScans((current) => current.map((scan) => scan.documentId === documentId ? update(scan) : scan));
  }

  function upsertMedicationScan(next: MedicationScan) {
    setMedicationScans((current) => current.some((scan) => scan.documentId === next.documentId)
      ? current.map((scan) => scan.documentId === next.documentId ? next : scan)
      : [next, ...current]);
  }

  function scanFromPayload(documentId: string, payload: {
    status?: string; analysis?: { medicines?: MedicationScanMedicine[]; questions?: string[] };
  }): MedicationScan | null {
    if (payload.status === "confirmed") return null;
    if (payload.status === "failed" || payload.status === "rejected") {
      return { documentId, medicines: [], questions: [], status: "failed" };
    }
    if (payload.status === "queued" || payload.status === "processing") {
      return { documentId, medicines: [], questions: [], status: payload.status };
    }
    if (payload.status !== "review" || !payload.analysis) return null;
    const extracted = Array.isArray(payload.analysis.medicines)
      ? payload.analysis.medicines.filter((medicine) => typeof medicine?.name === "string") : [];
    return {
      documentId, medicines: extracted.length ? extracted : [emptyMedicine()],
      questions: Array.isArray(payload.analysis.questions) ? payload.analysis.questions : [], status: "review"
    };
  }

  async function restoreMedicationScans(nextRecords: MedicalRecord[]) {
    const documentIds = nextRecords
      .filter((record) => record.kind === "prescription")
      .flatMap((record) => record.documents)
      .filter((document) => document.mimeType.startsWith("image/") && !document.imported && (!document.scanStatus || document.scanStatus === 'idle'))
      .map((document) => document.id);
    await Promise.all(documentIds.map(async (documentId) => {
      try {
        const response = await fetch(`/api/pregnancy/documents/${documentId}/medication-scan`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as {
          status?: string; analysis?: { medicines?: MedicationScanMedicine[]; questions?: string[] };
        };
        const restored = scanFromPayload(documentId, payload);
        if (!restored) return;
        upsertMedicationScan(restored);
        if (restored.status === "queued" || restored.status === "processing") void pollMedicationScan(documentId);
      } catch { /* The saved document remains available even if recognition is offline. */ }
    }));
  }

  async function pollMedicationScan(documentId: string) {
    if (pollingScans.current.has(documentId)) return;
    pollingScans.current.add(documentId);
    try {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const response = await fetch(`/api/pregnancy/documents/${documentId}/medication-scan`, { cache: "no-store" });
        if (!response.ok) throw new Error("scan_status_failed");
        const payload = await response.json() as {
          status?: string; analysis?: { medicines?: MedicationScanMedicine[]; questions?: string[] };
        };
        const next = scanFromPayload(documentId, payload);
        if (!next) return;
        upsertMedicationScan(next);
        if (next.status === "review" || next.status === "failed") return;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error("scan_timeout");
    } catch {
      upsertMedicationScan({ documentId, medicines: [], questions: [], status: "failed" });
    } finally {
      pollingScans.current.delete(documentId);
    }
  }

  async function queueMedicationScan(documentId: string) {
    upsertMedicationScan({ documentId, medicines: [], questions: [], status: "queued" });
    try {
      const queued = await fetch(`/api/pregnancy/documents/${documentId}/medication-scan`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}"
      });
      if (!queued.ok) throw new Error("scan_queue_failed");
      await pollMedicationScan(documentId);
    } catch {
      upsertMedicationScan({ documentId, medicines: [], questions: [], status: "failed" });
    }
  }

  function updateScannedMedicine(documentId: string, index: number, field: keyof MedicalMedicine, value: string) {
    updateMedicationScan(documentId, (scan) => ({
      ...scan,
      medicines: scan.medicines.map((medicine, itemIndex) => itemIndex === index ? { ...medicine, [field]: value } : medicine)
    }));
  }

  async function confirmMedicationScan(scan: MedicationScan) {
    const confirmed = scan.medicines
      .filter((medicine) => medicine.name.trim())
      .map(({ name, ingredients, dose, frequency, instructions }) => ({
        name, ingredients: ingredients ?? "", dose, frequency, instructions
      }));
    if (!confirmed.length) return;
    updateMedicationScan(scan.documentId, (current) => ({ ...current, status: "saving" }));
    try {
      const response = await fetch(`/api/pregnancy/documents/${scan.documentId}/medication-scan`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ medicines: confirmed })
      });
      if (!response.ok) throw new Error("scan_confirm_failed");
      updateMedicationScan(scan.documentId, (current) => ({ ...current, status: "confirmed" }));
      clearPrivateGetCache("/api/pregnancy/records");
      await load();
    } catch {
      updateMedicationScan(scan.documentId, (current) => ({ ...current, status: "review" }));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saveLock.current) return;
    saveLock.current = true; setStatus("saving");
    const form = event.currentTarget;
    const data = new FormData(form);
    const files = Array.from((form.elements.namedItem("documents") as HTMLInputElement | null)?.files ?? []);
    if (files.length > 6) { setUploadNotice('Chọn tối đa 6 file mỗi lần. Chưa file nào bị bỏ qua.'); setStatus('idle'); saveLock.current = false; return; }
    setUploadNotice('');
    const measurements = { ...(editingRecord?.measurements ?? {}) };
    for (const metric of MEDICAL_MEASUREMENTS) {
      const value = optionalNumber(data, metric.key);
      if (value === null) delete measurements[metric.key]; else measurements[metric.key] = value;
    }
    if (Object.keys(measurements).length && !measurementsReviewed) {
      setMeasurementError("Đối chiếu số và đơn vị với bản gốc rồi tích xác nhận trước khi lưu."); setStatus("idle"); saveLock.current = false; return;
    }
    setMeasurementError("");
    try {
      recordId.current ??= editingRecord?.id ?? crypto.randomUUID();
      const notes = kind === "appointment" ? encodeAppointmentWorkspace({
        questions: String(data.get("appointmentQuestions") ?? "").split(/\r?\n/),
        checklist: data.getAll("appointmentChecklist").map(String),
        outcome: String(data.get("appointmentOutcome") ?? "")
      }) : String(data.get("notes") ?? "");
      const response = await fetch("/api/pregnancy/records", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          id: recordId.current, kind,
          status: formMode === "outcome" ? "completed" : formMode === "prepare" ? "planned" : data.get("status"),
          occurredAt: new Date(String(data.get("occurredAt"))).toISOString(),
          title: data.get("title"), provider: data.get("provider") ?? "", clinician: data.get("clinician") ?? "",
          notes, gestationalWeek: optionalNumber(data, "gestationalWeek"),
          nextAppointmentAt: data.get("nextAppointmentAt") ? new Date(String(data.get("nextAppointmentAt"))).toISOString() : null,
          measurements, measurementsConfirmed: measurementsReviewed, medicines: kind === "prescription" ? medicines.filter((medicine) => medicine.name.trim()) : []
        })
      });
      if (!response.ok) throw new Error("save_failed");
      const result = await response.json() as { id?: string };
      if (!result.id) throw new Error("save_failed");
      clearPrivateGetCache("/api/pregnancy/records");
      const uploaded: Array<{ documentId: string; mimeType: string }> = [];
      for (const file of files.slice(0, 6)) {
        const attempt = documentAttempts.current.get(file) ?? { id: crypto.randomUUID() };
        documentAttempts.current.set(file, attempt);
        attempt.result ??= await uploadDocument(result.id, file, attempt.id);
        uploaded.push(attempt.result);
      }
      // All new documents, including prescription photos, use the dedicated document worker.
      for (const document of uploaded) {
        try {
          const queued = await fetch(`/api/pregnancy/documents/${document.documentId}/scan`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
          });
          if (!queued.ok) throw new Error('queue_failed');
        } catch { setUploadNotice('Hồ sơ đã lưu. Mở “Đọc & đối chiếu” trên tài liệu để thử đọc lại.'); }
      }
      form.reset(); setKind("appointment"); setMedicines([emptyMedicine()]);
      recordId.current = null; documentAttempts.current.clear();
      setEditingRecord(null); setFormMode("new"); setShowForm(false); await load();
    } catch { setStatus("error"); }
    finally { saveLock.current = false; }
  }

  function updateMedicine(index: number, field: keyof MedicalMedicine, value: string) {
    setMedicines((current) => current.map((medicine, itemIndex) => itemIndex === index ? { ...medicine, [field]: value } : medicine));
  }

  async function remove(id: string) {
    if (!window.confirm("Chuyển hồ sơ này vào mục đã xóa?")) return;
    setStatus("saving");
    try {
      const response = await fetch(`/api/pregnancy/records/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      clearPrivateGetCache("/api/pregnancy/records");
      await load();
    } catch { setStatus("error"); }
  }

  return (
    <section className="medical-records" id="ho-so-kham" aria-labelledby="medical-records-title">
      <div className="section-heading-row medical-records-heading">
        <div><p className="panel-kicker">Lịch hẹn · kết quả · đơn thuốc</p><h2 id="medical-records-title">Hồ sơ khám thai</h2></div>
        <button className="medical-add" type="button" disabled={status === "saving"} onClick={() => {
          if (showForm) { setShowForm(false); setEditingRecord(null); setFormMode("new"); }
          else openForm("new");
        }}>{showForm ? "Đóng" : "+ Thêm hồ sơ"}</button>
      </div>
      <MedicalDocumentIntake onSaved={() => void load()} />
      <div className="medical-subsection-title"><h3>Lịch khám tiếp theo</h3></div>
      {insights.upcoming ? <article className="next-appointment">
        <span aria-hidden="true">○</span><div className="appointment-workspace">
          <small>{insights.upcoming.followUpFromCompleted ? "Ngày tái khám đã ghi" : "Lịch gần nhất"}</small><h4>Buổi khám sắp tới</h4><strong>{insights.upcoming.title}</strong>
          <p>{displayDate(insights.upcoming.occurredAt)}{insights.upcoming.provider ? ` · ${insights.upcoming.provider}` : ""}</p>
          {(() => {
            const workspace = decodeAppointmentWorkspace(insights.upcoming.notes);
            return <>
              {workspace.questions.length ? <div className="appointment-prepared-block"><b>Câu hỏi đã chuẩn bị</b><ul>{workspace.questions.map((question) => <li key={question}>{question}</li>)}</ul></div> : <p>Chưa có câu hỏi. Ghi trước để vào phòng khám không quên.</p>}
              <div className="appointment-check-summary"><b>Trước khi đi</b>{APPOINTMENT_CHECKLIST.map((item) => <span key={item.id} className={workspace.checklist.includes(item.id) ? "is-done" : ""}>{workspace.checklist.includes(item.id) ? "✓" : "○"} {item.label}</span>)}</div>
              {insights.upcoming.documents.length ? <div className="medical-documents">{insights.upcoming.documents.map((document) => <MedicalDocumentButton key={document.id} document={document} documents={insights.upcoming!.documents} />)}</div> : null}
            </>;
          })()}
          {insights.upcoming.followUpFromCompleted
            ? <div className="appointment-actions"><Link href="/lich" prefetch={false}>Mở trong lịch gia đình</Link></div>
            : <div className="appointment-actions">
              <button type="button" onClick={() => openForm("prepare", insights.upcoming)}>Chuẩn bị buổi khám</button>
              <button type="button" onClick={() => openForm("outcome", insights.upcoming)}>Ghi kết quả sau khám</button>
            </div>}
        </div>
      </article> : <div className="medical-empty-short"><strong>Chưa có lịch khám sắp tới</strong><p>Thêm lịch để EmBe đặt đúng ngày trong dòng thời gian.</p></div>}

      {showForm ? <form className="medical-form" id="medical-record-form" key={`${formMode}-${editingRecord?.id ?? "new"}`} onSubmit={(event) => void save(event)}>
        <h3>{formMode === "prepare" ? "Chuẩn bị buổi khám" : formMode === "outcome" ? "Ghi kết quả sau khám" : editingRecord ? `Sửa ${kinds[editingRecord.kind]?.toLocaleLowerCase("vi") ?? "hồ sơ"}` : kind === "prescription" ? "Thêm đơn thuốc" : "Thêm hồ sơ khám"}</h3>
        {formMode === "new" ? <div className="medical-kind-picker" role="group" aria-label="Phân loại hồ sơ">
          {Object.entries(kinds).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
        </div> : null}
        <div className="medical-form-grid">
          <label>Tiêu đề<input name="title" required maxLength={100} defaultValue={editingRecord?.title} placeholder={kind === "prescription" ? "Đơn thuốc ngày khám" : "Khám thai định kỳ"} /></label>
          {formMode === "new" ? <label>Trạng thái<select key={`${editingRecord?.id ?? 'new'}-${kind}`} name="status" defaultValue={editingRecord?.status ?? (kind === "appointment" ? "planned" : "completed")}><option value="planned">Sắp tới</option><option value="completed">Đã hoàn thành</option></select></label> : null}
          <label>Ngày và giờ<input name="occurredAt" type="datetime-local" required defaultValue={editingRecord ? localDateTime(new Date(editingRecord.occurredAt)) : localDateTime()} /></label>
          <label>Tuần thai<input name="gestationalWeek" type="number" inputMode="numeric" min="1" max="42" defaultValue={editingRecord?.gestationalWeek ?? undefined} /></label>
          <label>Nơi khám<input name="provider" maxLength={120} defaultValue={editingRecord?.provider} placeholder="Bệnh viện hoặc phòng khám" /></label>
          <label>Bác sĩ<input name="clinician" maxLength={100} defaultValue={editingRecord?.clinician} placeholder="Nếu muốn ghi" /></label>
          <label className="medical-wide">Lịch hẹn tiếp theo<input name="nextAppointmentAt" type="datetime-local" defaultValue={editingRecord?.nextAppointmentAt ? localDateTime(new Date(editingRecord.nextAppointmentAt)) : undefined} /></label>
        </div>
        <details className="medical-measurements">
          <summary>Chỉ số được ghi tại nơi khám <span>⌄</span></summary>
          <p>Chỉ chép chỉ số có trên phiếu. Giữ đúng đơn vị; không suy ra kết quả từ ảnh khi chưa kiểm tra.</p>
          {["Số đo khi khám", "Siêu âm", "Xét nghiệm"].map(group => <details key={group}><summary>{group}</summary><div>
            {MEDICAL_MEASUREMENTS.filter(metric => metric.group === group).map(metric => <label key={metric.key}>{metric.label} ({metric.unit})
              <input name={metric.key} type="number" inputMode="decimal" min="0" max={metric.max} step="any" defaultValue={editingRecord?.measurements[metric.key]} onChange={() => setMeasurementsReviewed(false)} />
            </label>)}
          </div></details>)}
          <label className="check-line"><input type="checkbox" checked={measurementsReviewed} onChange={e => setMeasurementsReviewed(e.target.checked)} />Tôi đã đối chiếu chỉ số và đơn vị với bản gốc</label>
        </details>
        {measurementError ? <p role="alert">{measurementError}</p> : null}
        {kind === "appointment" ? <fieldset className="appointment-preparation">
          <legend>Câu hỏi và checklist trước khám</legend>
          <label>Câu hỏi muốn hỏi bác sĩ
            <textarea name="appointmentQuestions" rows={4} maxLength={1200} defaultValue={appointmentWorkspace.questions.join("\n")} placeholder="Mỗi câu một dòng" />
          </label>
          <div className="appointment-checklist" role="group" aria-label="Checklist trước khám">
            {APPOINTMENT_CHECKLIST.map((item) => <label key={item.id}>
              <input name="appointmentChecklist" type="checkbox" value={item.id} defaultChecked={appointmentWorkspace.checklist.includes(item.id)} />
              <span>{item.label}</span>
            </label>)}
          </div>
          <label>Kết quả và lời dặn sau khám
            <textarea name="appointmentOutcome" rows={4} maxLength={1000} defaultValue={appointmentWorkspace.outcome} placeholder="Ghi đúng điều bác sĩ đã trao đổi" />
          </label>
        </fieldset> : null}
        {kind === "prescription" ? <div className="medical-medicines">
          <strong>Thuốc ghi trên đơn</strong>
          <small>Có thể nhập ngay hoặc để trống rồi chụp ảnh đơn thuốc bên dưới.</small>
          {medicines.map((medicine, index) => <div className="medical-medicine-row" key={index}>
            <label>Tên thuốc<input value={medicine.name} maxLength={100} onChange={(event) => updateMedicine(index, "name", event.target.value)} /></label>
            <label className="medical-ingredients">Thành phần / hàm lượng<textarea rows={3} value={medicine.ingredients ?? ""} maxLength={1200} placeholder="Ví dụ: Sắt 27 mg; DHA 200 mg" onChange={(event) => updateMedicine(index, "ingredients", event.target.value)} /></label>
            <label>Liều<input value={medicine.dose} maxLength={80} placeholder="1 viên" onChange={(event) => updateMedicine(index, "dose", event.target.value)} /></label>
            <label>Số lần<input value={medicine.frequency} maxLength={80} placeholder="Sau ăn sáng" onChange={(event) => updateMedicine(index, "frequency", event.target.value)} /></label>
            <label>Cách dùng<input value={medicine.instructions} maxLength={200} onChange={(event) => updateMedicine(index, "instructions", event.target.value)} /></label>
          </div>)}
          {medicines.length < 12 ? <button type="button" onClick={() => setMedicines((current) => [...current, emptyMedicine()])}>+ Thêm thuốc</button> : null}
        </div> : null}
        {kind !== "appointment" ? <label className="medical-notes">Ghi chú<textarea name="notes" rows={3} maxLength={2000} defaultValue={editingRecord?.notes} placeholder="Điều bác sĩ dặn, câu hỏi cần nhớ…" /></label> : null}
        <label className="medical-files">{formMode === "outcome" ? "Hồ sơ hoặc tài liệu sau khám" : "Hồ sơ hoặc tài liệu mang theo"}
          <input name="documents" type="file" multiple accept="image/*,application/pdf" />
          <small>Ảnh và PDF được đọc thử trên máy tại nhà, cần đối chiếu trước khi dùng. Tối đa 6 file, 15 MB/file; PDF tối đa 6 trang. Chụp thẳng trang, rõ chữ và đủ bốn góc. Chỉ Hiếu và Ngân xem được.</small>
        </label>
        <button className="health-save" type="submit" disabled={status === "saving"}>{status === "saving" ? "Đang lưu…" : formMode === "prepare" ? "Lưu chuẩn bị" : formMode === "outcome" ? "Lưu kết quả" : "Lưu hồ sơ"}</button>
      </form> : null}

      {medicationScans.map((scan) => <article className="medication-scan-review" key={scan.documentId} aria-label="Kiểm tra đơn thuốc từ ảnh">
        <header><div><strong>Kiểm tra đơn thuốc</strong><small>Đối chiếu từng dòng với ảnh gốc</small></div>
          <span>{scan.status === "queued" || scan.status === "processing" ? "Đang đọc…" : scan.status === "confirmed" ? "Đã xác nhận" : scan.status === "failed" ? "Chưa đọc được" : "Cần Mẹ kiểm tra"}</span></header>
        <img src={`/api/pregnancy/documents/${scan.documentId}`} alt="Ảnh đơn thuốc gốc" />
        <MedicalDocumentButton document={{ id: scan.documentId, originalFilename: 'Đơn thuốc gốc', mimeType: 'image/jpeg' }}>Xem ảnh đơn thuốc</MedicalDocumentButton>
        {scan.status === "failed" ? <div className="medication-scan-message"><p>Máy chưa đọc được ảnh này. Ảnh vẫn được lưu an toàn.</p><button type="button" onClick={() => void queueMedicationScan(scan.documentId)}>Thử đọc lại</button></div> : null}
        {scan.status === "review" || scan.status === "saving" ? <div className="medication-scan-editor">
          {scan.medicines.map((medicine, index) => <div className="medical-medicine-row" key={index}>
            <label>Tên thuốc<input value={medicine.name} maxLength={100} onChange={(event) => updateScannedMedicine(scan.documentId, index, "name", event.target.value)} /></label>
            <label className="medical-ingredients">Thành phần / hàm lượng<textarea rows={3} value={medicine.ingredients ?? ""} maxLength={1200} onChange={(event) => updateScannedMedicine(scan.documentId, index, "ingredients", event.target.value)} /></label>
            <label>Liều<input value={medicine.dose} maxLength={80} onChange={(event) => updateScannedMedicine(scan.documentId, index, "dose", event.target.value)} /></label>
            <label>Số lần<input value={medicine.frequency} maxLength={80} onChange={(event) => updateScannedMedicine(scan.documentId, index, "frequency", event.target.value)} /></label>
            <label>Cách dùng<input value={medicine.instructions} maxLength={200} onChange={(event) => updateScannedMedicine(scan.documentId, index, "instructions", event.target.value)} /></label>
            {medicine.confidence !== undefined ? <small>Độ chắc chắn {Math.round(medicine.confidence * 100)}%</small> : null}
            {scan.medicines.length > 1 ? <button type="button" onClick={() => updateMedicationScan(scan.documentId, (current) => ({ ...current, medicines: current.medicines.filter((_, itemIndex) => itemIndex !== index) }))}>Bỏ dòng</button> : null}
          </div>)}
          {scan.questions.length ? <ul>{scan.questions.map((question) => <li key={question}>{question}</li>)}</ul> : null}
          <button className="medical-add" type="button" onClick={() => updateMedicationScan(scan.documentId, (current) => ({ ...current, medicines: [...current.medicines, emptyMedicine()] }))}>+ Thêm thuốc còn thiếu</button>
          <p>Chỉ chép lại nội dung trên đơn. Không tự đổi thuốc hoặc liều dùng.</p>
          <button className="health-save" type="button" disabled={scan.status === "saving" || !scan.medicines.some((medicine) => medicine.name.trim())} onClick={() => void confirmMedicationScan(scan)}>{scan.status === "saving" ? "Đang lưu…" : "Xác nhận đúng theo đơn"}</button>
        </div> : null}
      </article>)}

      <div className="medical-subsection-title">
        <h3>Hồ sơ đã lưu</h3>
        <small>{records.length ? `${records.length} mục` : "Chưa có"}</small>
      </div>
      <MeasurementHistory records={records} />
      {records.length ? <>
        <aside className="medical-insights">
          <div><strong>{insights.completedCount}</strong><span>lần đã lưu</span></div>
          <div><strong>{insights.activeMedicines.length}</strong><span>thuốc trong đơn</span></div>
          {insights.questions.length ? <ul>{insights.questions.map((question) => <li key={question}>{question}</li>)}</ul> : <p>Hồ sơ hiện đã có đủ mốc cơ bản để xem lại.</p>}
          <small>EmBe chỉ phát hiện phần chưa ghi và gom dữ liệu; không kết luận kết quả khám.</small>
        </aside>
        <div className="medical-filters" role="group" aria-label="Lọc hồ sơ">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả</button>
          {Object.entries(kinds).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <div className="medical-timeline">
          {visibleRecords.map((record) => <article key={record.id} id={`record-${record.id}`}>
            <i aria-hidden="true" />
            <div className="medical-record-head"><span>{kinds[record.kind] ?? "Hồ sơ"} · {record.documentIntake ? 'chờ xác nhận bản đọc' : record.status === "planned" ? "sắp tới" : "đã lưu"}</span>
              <div><button type="button" onClick={() => openForm("new", record)}>Sửa</button><button type="button" onClick={() => void remove(record.id)}>Xóa</button></div></div>
            <strong>{record.title}</strong><time>{record.documentIntake ? 'Tải lên · ' : ''}{record.documentDateOnly ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'long' }).format(new Date(record.occurredAt)) : displayDate(record.occurredAt)}</time>
            {record.linkedRecordId && records.some(r => r.id === record.linkedRecordId) ? <p><a href={`#record-${record.linkedRecordId}`} onClick={() => setFilter('all')}>Cùng lần khám · {records.find(r => r.id === record.linkedRecordId)?.title}</a></p> : null}
            {records.some(r => r.linkedRecordId === record.id) ? <p>{records.filter(r => r.linkedRecordId === record.id).map(r => <a key={r.id} href={`#record-${r.id}`} onClick={() => setFilter('all')}>{r.title} · </a>)}</p> : null}
            {(record.provider || record.clinician) ? <p>{[record.provider, record.clinician].filter(Boolean).join(" · ")}</p> : null}
            {record.gestationalWeek ? <small>Tuần thai {record.gestationalWeek}</small> : null}
            {record.medicines.length ? <ul className="medical-record-medicines">{record.medicines.map((medicine, index) => <li key={`${medicine.name}-${index}`}><b>{medicine.name}</b>{medicine.ingredients ? <span>Thành phần: {medicine.ingredients}</span> : null}<span>{[medicine.dose, medicine.frequency, medicine.instructions].filter(Boolean).join(" · ")}</span></li>)}</ul> : null}
            {Object.keys(record.measurements).length ? <div className="medical-record-metrics">
              {Object.entries(record.measurements).map(([key, value]) => { const metric = MEDICAL_MEASUREMENTS.find(item => item.key === key);
                return <span key={key}><b>{value} {metric?.unit ?? ""}</b>{metric?.label ?? `${key} — xem đơn vị trong bản gốc`}</span>;
              })}
            </div> : null}
            {record.kind === "appointment" ? (() => {
              const workspace = decodeAppointmentWorkspace(record.notes);
              return <div className="appointment-record-summary">
                {workspace.questions.length ? <div><b>Câu hỏi đã chuẩn bị</b><ul>{workspace.questions.map((question) => <li key={question}>{question}</li>)}</ul></div> : null}
                {workspace.outcome ? <div><b>Kết quả và lời dặn</b><p>{workspace.outcome}</p></div> : null}
              </div>;
            })() : record.notes ? <p className="medical-record-note">{record.notes}</p> : null}
            {record.documents.length ? <div className="medical-documents">{record.documents.map((document) => <div key={document.id}>
              <MedicalDocumentButton document={document} documents={record.documents} />
              <Link href={`/me-bau/ho-so/tai-lieu/${document.id}`} prefetch={false}>{document.imported ? 'Đã thêm vào hồ sơ · xem bản đọc' : document.scanStatus === 'review' || document.scanStatus === 'confirmed' ? 'Đã đọc · xác nhận vào hồ sơ' : document.scanStatus === 'queued' || document.scanStatus === 'processing' ? 'Đang đọc · xem tiến độ' : 'Đọc & đối chiếu'}</Link>
            </div>)}</div> : null}
          </article>)}
        </div>
      </> : <div className="medical-empty-short"><strong>Chưa có hồ sơ đã lưu</strong><p>Kết quả khám, đơn thuốc và tài liệu sẽ được xếp theo ngày tại đây.</p></div>}
      {uploadNotice ? <p role="status">{uploadNotice}</p> : null}
      <p className={`medical-status is-${status}`} aria-live="polite">{status === "error" ? "Chưa lưu hoặc tải hồ sơ được. Hãy kiểm tra mạng và thử lại." : "Hồ sơ y tế được giữ riêng, không xuất hiện trong album gia đình."}</p>
    </section>
  );
}
