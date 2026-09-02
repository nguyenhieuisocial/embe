"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  APPOINTMENT_CHECKLIST,
  decodeAppointmentWorkspace,
  encodeAppointmentWorkspace,
  medicalInsights,
  type MedicalMedicine,
  type MedicalRecord
} from "../lib/pregnancy-medical";

const kinds: Record<string, string> = {
  appointment: "Khám thai", ultrasound: "Siêu âm", laboratory: "Xét nghiệm",
  prescription: "Đơn thuốc", other: "Tài liệu khác"
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

async function uploadDocument(recordId: string, file: File): Promise<void> {
  const documentId = crypto.randomUUID();
  const created = await fetch(`/api/pregnancy/records/${recordId}/documents`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId, filename: file.name || "tai-lieu", mimeType: file.type, byteSize: file.size })
  });
  if (!created.ok) throw new Error("create_document_failed");
  const session = await created.json() as { uploadUrl?: string };
  if (!session.uploadUrl) throw new Error("create_document_failed");
  const form = new FormData(); form.append("cacheControl", "0"); form.append("", file);
  const uploaded = await fetch(session.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
  if (!uploaded.ok) throw new Error("upload_failed");
  const completed = await fetch(`/api/pregnancy/documents/${documentId}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}"
  });
  if (!completed.ok) throw new Error("complete_failed");
}

export default function PregnancyMedicalRecords() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState("appointment");
  const [medicines, setMedicines] = useState<MedicalMedicine[]>([{ name: "", dose: "", frequency: "", instructions: "" }]);
  const [filter, setFilter] = useState("all");
  const [formMode, setFormMode] = useState<"new" | "prepare" | "outcome">("new");
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");

  async function load() {
    try {
      const response = await fetch("/api/pregnancy/records", { cache: "no-store" });
      if (!response.ok) throw new Error("records unavailable");
      const payload = await response.json() as { records?: MedicalRecord[] };
      setRecords(payload.records ?? []); setStatus("idle");
    } catch { setStatus("error"); }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("quick") === "appointment") setShowForm(true);
    void load();
  }, []);
  const insights = useMemo(() => medicalInsights(records), [records]);
  const visibleRecords = filter === "all" ? records : records.filter((record) => record.kind === filter);
  const appointmentWorkspace = decodeAppointmentWorkspace(editingRecord?.notes ?? "");

  function openForm(mode: "new" | "prepare" | "outcome", record: MedicalRecord | null = null) {
    setFormMode(mode); setEditingRecord(record); setKind(record?.kind ?? "appointment"); setShowForm(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("saving");
    const form = event.currentTarget;
    const data = new FormData(form);
    const files = Array.from((form.elements.namedItem("documents") as HTMLInputElement | null)?.files ?? []);
    const measurements = Object.fromEntries([
      ["weightKg", optionalNumber(data, "weightKg")], ["systolic", optionalNumber(data, "systolic")],
      ["diastolic", optionalNumber(data, "diastolic")], ["fetalHeartRate", optionalNumber(data, "fetalHeartRate")]
    ].filter((entry): entry is [string, number] => entry[1] !== null));
    try {
      const notes = kind === "appointment" ? encodeAppointmentWorkspace({
        questions: String(data.get("appointmentQuestions") ?? "").split(/\r?\n/),
        checklist: data.getAll("appointmentChecklist").map(String),
        outcome: String(data.get("appointmentOutcome") ?? "")
      }) : String(data.get("notes") ?? "");
      const response = await fetch("/api/pregnancy/records", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          id: editingRecord?.id ?? null, kind,
          status: formMode === "outcome" ? "completed" : formMode === "prepare" ? "planned" : data.get("status"),
          occurredAt: new Date(String(data.get("occurredAt"))).toISOString(),
          title: data.get("title"), provider: data.get("provider") ?? "", clinician: data.get("clinician") ?? "",
          notes, gestationalWeek: optionalNumber(data, "gestationalWeek"),
          nextAppointmentAt: data.get("nextAppointmentAt") ? new Date(String(data.get("nextAppointmentAt"))).toISOString() : null,
          measurements, medicines: kind === "prescription" ? medicines.filter((medicine) => medicine.name.trim()) : []
        })
      });
      if (!response.ok) throw new Error("save_failed");
      const result = await response.json() as { id?: string };
      if (!result.id) throw new Error("save_failed");
      for (const file of files.slice(0, 6)) await uploadDocument(result.id, file);
      form.reset(); setKind("appointment"); setMedicines([{ name: "", dose: "", frequency: "", instructions: "" }]);
      setEditingRecord(null); setFormMode("new"); setShowForm(false); await load();
    } catch { setStatus("error"); }
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
      await load();
    } catch { setStatus("error"); }
  }

  return (
    <section className="medical-records" id="ho-so-kham" aria-labelledby="medical-records-title">
      <div className="section-heading-row medical-records-heading">
        <div><p className="panel-kicker">Lịch hẹn · kết quả · đơn thuốc</p><h2 id="medical-records-title">Hồ sơ khám thai</h2></div>
        <button className="medical-add" type="button" onClick={() => {
          if (showForm) { setShowForm(false); setEditingRecord(null); setFormMode("new"); }
          else openForm("new");
        }}>{showForm ? "Đóng" : "+ Thêm hồ sơ"}</button>
      </div>

      <div className="medical-subsection-title"><h3>Lịch khám tiếp theo</h3></div>
      {insights.upcoming ? <article className="next-appointment">
        <span aria-hidden="true">○</span><div className="appointment-workspace">
          <small>Lịch gần nhất</small><h4>Buổi khám sắp tới</h4><strong>{insights.upcoming.title}</strong>
          <p>{displayDate(insights.upcoming.occurredAt)}{insights.upcoming.provider ? ` · ${insights.upcoming.provider}` : ""}</p>
          {(() => {
            const workspace = decodeAppointmentWorkspace(insights.upcoming.notes);
            return <>
              {workspace.questions.length ? <div className="appointment-prepared-block"><b>Câu hỏi đã chuẩn bị</b><ul>{workspace.questions.map((question) => <li key={question}>{question}</li>)}</ul></div> : <p>Chưa có câu hỏi. Ghi trước để vào phòng khám không quên.</p>}
              <div className="appointment-check-summary"><b>Trước khi đi</b>{APPOINTMENT_CHECKLIST.map((item) => <span key={item.id} className={workspace.checklist.includes(item.id) ? "is-done" : ""}>{workspace.checklist.includes(item.id) ? "✓" : "○"} {item.label}</span>)}</div>
              {insights.upcoming.documents.length ? <div className="medical-documents">{insights.upcoming.documents.map((document) => <a key={document.id} href={`/api/pregnancy/documents/${document.id}`} target="_blank" rel="noreferrer">{document.mimeType === "application/pdf" ? "PDF" : "Ảnh"} · {document.originalFilename}</a>)}</div> : null}
            </>;
          })()}
          <div className="appointment-actions">
            <button type="button" onClick={() => openForm("prepare", insights.upcoming)}>Chuẩn bị buổi khám</button>
            <button type="button" onClick={() => openForm("outcome", insights.upcoming)}>Ghi kết quả sau khám</button>
          </div>
        </div>
      </article> : <div className="medical-empty-short"><strong>Chưa có lịch khám sắp tới</strong><p>Thêm lịch để EmBe đặt đúng ngày trong dòng thời gian.</p></div>}

      {showForm ? <form className="medical-form" key={`${formMode}-${editingRecord?.id ?? "new"}`} onSubmit={(event) => void save(event)}>
        <h3>{formMode === "prepare" ? "Chuẩn bị buổi khám" : formMode === "outcome" ? "Ghi kết quả sau khám" : "Thêm hồ sơ khám"}</h3>
        {formMode === "new" ? <div className="medical-kind-picker" role="group" aria-label="Phân loại hồ sơ">
          {Object.entries(kinds).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
        </div> : null}
        <div className="medical-form-grid">
          <label>Tiêu đề<input name="title" required maxLength={100} defaultValue={editingRecord?.title} placeholder={kind === "prescription" ? "Đơn thuốc ngày khám" : "Khám thai định kỳ"} /></label>
          {formMode === "new" ? <label>Trạng thái<select name="status" defaultValue="planned"><option value="planned">Sắp tới</option><option value="completed">Đã hoàn thành</option></select></label> : null}
          <label>Ngày và giờ<input name="occurredAt" type="datetime-local" required defaultValue={editingRecord ? localDateTime(new Date(editingRecord.occurredAt)) : localDateTime()} /></label>
          <label>Tuần thai<input name="gestationalWeek" type="number" inputMode="numeric" min="1" max="42" defaultValue={editingRecord?.gestationalWeek ?? undefined} /></label>
          <label>Nơi khám<input name="provider" maxLength={120} defaultValue={editingRecord?.provider} placeholder="Bệnh viện hoặc phòng khám" /></label>
          <label>Bác sĩ<input name="clinician" maxLength={100} defaultValue={editingRecord?.clinician} placeholder="Nếu muốn ghi" /></label>
          <label className="medical-wide">Lịch hẹn tiếp theo<input name="nextAppointmentAt" type="datetime-local" defaultValue={editingRecord?.nextAppointmentAt ? localDateTime(new Date(editingRecord.nextAppointmentAt)) : undefined} /></label>
        </div>
        <details className="medical-measurements">
          <summary>Chỉ số được ghi tại nơi khám <span>⌄</span></summary>
          <div><label>Cân nặng (kg)<input name="weightKg" type="number" inputMode="decimal" min="25" max="300" step="0.1" /></label>
            <label>Huyết áp trên<input name="systolic" type="number" inputMode="numeric" min="40" max="300" /></label>
            <label>Huyết áp dưới<input name="diastolic" type="number" inputMode="numeric" min="30" max="200" /></label>
            <label>Nhịp tim thai<input name="fetalHeartRate" type="number" inputMode="numeric" min="30" max="300" /></label></div>
        </details>
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
          {medicines.map((medicine, index) => <div className="medical-medicine-row" key={index}>
            <label>Tên thuốc<input required value={medicine.name} maxLength={100} onChange={(event) => updateMedicine(index, "name", event.target.value)} /></label>
            <label>Liều<input value={medicine.dose} maxLength={80} placeholder="1 viên" onChange={(event) => updateMedicine(index, "dose", event.target.value)} /></label>
            <label>Số lần<input value={medicine.frequency} maxLength={80} placeholder="Sau ăn sáng" onChange={(event) => updateMedicine(index, "frequency", event.target.value)} /></label>
            <label>Cách dùng<input value={medicine.instructions} maxLength={200} onChange={(event) => updateMedicine(index, "instructions", event.target.value)} /></label>
          </div>)}
          {medicines.length < 12 ? <button type="button" onClick={() => setMedicines((current) => [...current, { name: "", dose: "", frequency: "", instructions: "" }])}>+ Thêm thuốc</button> : null}
        </div> : null}
        {kind !== "appointment" ? <label className="medical-notes">Ghi chú<textarea name="notes" rows={3} maxLength={2000} defaultValue={editingRecord?.notes} placeholder="Điều bác sĩ dặn, câu hỏi cần nhớ…" /></label> : null}
        <label className="medical-files">{formMode === "outcome" ? "Hồ sơ hoặc tài liệu sau khám" : "Hồ sơ hoặc tài liệu mang theo"}
          <input name="documents" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
          <small>Tối đa 6 file mỗi lần, 15 MB/file. Chỉ Hiếu và Ngân xem được.</small>
        </label>
        <button className="health-save" type="submit" disabled={status === "saving"}>{status === "saving" ? "Đang lưu…" : formMode === "prepare" ? "Lưu chuẩn bị" : formMode === "outcome" ? "Lưu kết quả" : "Lưu hồ sơ"}</button>
      </form> : null}

      <div className="medical-subsection-title">
        <h3>Hồ sơ đã lưu</h3>
        <small>{records.length ? `${records.length} mục` : "Chưa có"}</small>
      </div>
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
          {visibleRecords.map((record) => <article key={record.id}>
            <i aria-hidden="true" />
            <div className="medical-record-head"><span>{kinds[record.kind] ?? "Hồ sơ"} · {record.status === "planned" ? "sắp tới" : "đã xong"}</span>
              <button type="button" onClick={() => void remove(record.id)}>Xóa</button></div>
            <strong>{record.title}</strong><time>{displayDate(record.occurredAt)}</time>
            {(record.provider || record.clinician) ? <p>{[record.provider, record.clinician].filter(Boolean).join(" · ")}</p> : null}
            {record.gestationalWeek ? <small>Tuần thai {record.gestationalWeek}</small> : null}
            {record.medicines.length ? <ul className="medical-record-medicines">{record.medicines.map((medicine, index) => <li key={`${medicine.name}-${index}`}><b>{medicine.name}</b>{[medicine.dose, medicine.frequency, medicine.instructions].filter(Boolean).join(" · ")}</li>)}</ul> : null}
            {Object.keys(record.measurements).length ? <div className="medical-record-metrics">
              {record.measurements.weightKg ? <span><b>{record.measurements.weightKg} kg</b>Cân nặng</span> : null}
              {record.measurements.systolic && record.measurements.diastolic ? <span><b>{record.measurements.systolic}/{record.measurements.diastolic}</b>Huyết áp đã ghi</span> : null}
              {record.measurements.fetalHeartRate ? <span><b>{record.measurements.fetalHeartRate}</b>Nhịp tim thai đã ghi</span> : null}
            </div> : null}
            {record.kind === "appointment" ? (() => {
              const workspace = decodeAppointmentWorkspace(record.notes);
              return <div className="appointment-record-summary">
                {workspace.questions.length ? <div><b>Câu hỏi đã chuẩn bị</b><ul>{workspace.questions.map((question) => <li key={question}>{question}</li>)}</ul></div> : null}
                {workspace.outcome ? <div><b>Kết quả và lời dặn</b><p>{workspace.outcome}</p></div> : null}
              </div>;
            })() : record.notes ? <p className="medical-record-note">{record.notes}</p> : null}
            {record.documents.length && record.id !== insights.upcoming?.id ? <div className="medical-documents">{record.documents.map((document) => <a key={document.id} href={`/api/pregnancy/documents/${document.id}`} target="_blank" rel="noreferrer">{document.mimeType === "application/pdf" ? "PDF" : "Ảnh"} · {document.originalFilename}</a>)}</div> : null}
          </article>)}
        </div>
      </> : <div className="medical-empty-short"><strong>Chưa có hồ sơ đã lưu</strong><p>Kết quả khám, đơn thuốc và tài liệu sẽ được xếp theo ngày tại đây.</p></div>}
      <p className={`medical-status is-${status}`} aria-live="polite">{status === "error" ? "Chưa lưu hoặc tải hồ sơ được. Hãy kiểm tra mạng và thử lại." : "Hồ sơ y tế được giữ riêng, không xuất hiện trong album gia đình."}</p>
    </section>
  );
}
