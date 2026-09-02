"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import AppHeader from "../../../components/app-header";

type Document = { id: string; original_filename?: string; originalFilename?: string; mime_type?: string; mimeType?: string };
type RecordItem = {
  id: string; kind: string; status: "planned" | "completed"; occurredAt: string; title: string;
  provider: string; clinician: string; notes: string; nextDueAt: string | null;
  details: Record<string, unknown>; documents: Document[];
};
const kinds: Record<string, string> = {
  discharge: "Ra viện", newborn_screening: "Sàng lọc sơ sinh", hearing: "Thính lực", eye: "Mắt",
  visit: "Lần khám", diagnosis: "Chẩn đoán", prescription: "Đơn thuốc", allergy: "Dị ứng",
  vaccination: "Tiêm chủng", other: "Hồ sơ khác"
};
function localDateTime(): string {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}
function dateTimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function displayDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function detailSummary(record: RecordItem): string | null {
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  if (record.kind === "vaccination") return [text(record.details.vaccine), text(record.details.dose)].filter(Boolean).join(" · ") || null;
  if (record.kind === "allergy") return [text(record.details.allergen), text(record.details.reaction)].filter(Boolean).join(" · ") || null;
  if (record.kind === "visit") {
    const values = [
      typeof record.details.weightG === "number" ? `${record.details.weightG} g` : null,
      typeof record.details.lengthCm === "number" ? `${record.details.lengthCm} cm` : null,
      typeof record.details.headCm === "number" ? `Vòng đầu ${record.details.headCm} cm` : null,
      typeof record.details.temperatureC === "number" ? `${record.details.temperatureC} °C` : null
    ];
    return values.filter(Boolean).join(" · ") || null;
  }
  if (record.kind === "prescription" && Array.isArray(record.details.medicines)) {
    const medicines = record.details.medicines.flatMap((item) => {
      const name = item && typeof item === "object" ? text((item as Record<string, unknown>).name) : null;
      return name ? [name] : [];
    });
    return medicines.join(" · ") || null;
  }
  return text(record.details.result) ?? text(record.details.followUp);
}
async function uploadDocument(recordId: string, file: File): Promise<void> {
  const documentId = crypto.randomUUID();
  const created = await fetch(`/api/baby/medical/${recordId}/documents`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId, filename: file.name || "tai-lieu", mimeType: file.type, byteSize: file.size }) });
  if (!created.ok) throw new Error("create_failed");
  const { uploadUrl } = await created.json() as { uploadUrl?: string };
  if (!uploadUrl) throw new Error("create_failed");
  const form = new FormData(); form.append("cacheControl", "0"); form.append("", file);
  if (!(await fetch(uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form })).ok) throw new Error("upload_failed");
  if (!(await fetch(`/api/baby/medical/documents/${documentId}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).ok) throw new Error("complete_failed");
}

export default function BabyMedicalPage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [kind, setKind] = useState("visit");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecordItem | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  async function load() {
    try {
      const response = await fetch("/api/baby/medical", { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      setRecords((await response.json() as { records: RecordItem[] }).records); setStatus("idle");
    } catch { setStatus("error"); }
  }
  useEffect(() => { void load(); }, []);
  const upcoming = useMemo(() => records.filter((item) => item.status === "planned" && new Date(item.occurredAt) >= new Date()).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0], [records]);

  function startEdit(record: RecordItem) {
    setEditing(record); setKind(record.kind); setOpen(true);
    requestAnimationFrame(() => document.getElementById("baby-medical-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("saving");
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const optional = (name: string) => value(name) ? Number(value(name)) : null;
    let details: Record<string, unknown>;
    if (kind === "vaccination") details = { vaccine: value("vaccine"), dose: value("dose") || null, reaction: value("reaction") || null };
    else if (kind === "allergy") details = { allergen: value("allergen"), reaction: value("reaction") || null, severity: value("severity") || "unknown" };
    else if (kind === "visit") details = { weightG: optional("weightG"), lengthCm: optional("lengthCm"), headCm: optional("headCm"), temperatureC: optional("temperatureC") };
    else if (kind === "prescription") details = { medicines: value("medicine") ? [{ name: value("medicine"), dose: value("dose"), frequency: value("frequency"), instructions: value("instructions") }] : [] };
    else details = { result: value("result") || null, followUp: value("followUp") || null };
    try {
      const response = await fetch("/api/baby/medical", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        id: editing?.id ?? null, kind, status: form.get("status"), occurredAt: new Date(value("occurredAt")).toISOString(),
        title: value("title"), provider: value("provider"), clinician: value("clinician"), notes: value("notes"),
        nextDueAt: value("nextDueAt") ? new Date(value("nextDueAt")).toISOString() : null, details
      }) });
      if (!response.ok) throw new Error("save_failed");
      const result = await response.json() as { record?: RecordItem };
      if (!result.record?.id) throw new Error("save_failed");
      const files = Array.from((formElement.elements.namedItem("documents") as HTMLInputElement | null)?.files ?? []).slice(0, 6);
      for (const file of files) await uploadDocument(result.record.id, file);
      formElement.reset(); setEditing(null); setOpen(false); await load();
    } catch { setStatus("error"); }
  }

  return <main className="page-shell baby-medical-page">
    <AppHeader note="Chỉ Hiếu và Ngân xem được" />
    <header className="page-intro"><p className="panel-kicker">Hồ sơ của Bé</p><h1>Khám, tiêm và tài liệu</h1><p>Mọi phiếu hẹn, kết quả và đơn thuốc nằm đúng một dòng thời gian.</p></header>
    {upcoming ? <a className="baby-next-care" href="#ho-so-be"><small>Sắp tới</small><strong>{upcoming.title}</strong><span>{displayDate(upcoming.occurredAt)}</span></a> : null}
    <section className="baby-medical-panel" id="ho-so-be">
      <div className="section-heading-row"><div><p className="panel-kicker">Riêng tư · dễ tìm lại</p><h2>Hồ sơ y tế</h2></div><button className="medical-add" type="button" onClick={() => { if (open) { setOpen(false); setEditing(null); } else { setEditing(null); setKind("visit"); setOpen(true); } }}>{open ? "Đóng" : "+ Thêm"}</button></div>
      {open ? <form className="medical-form" id="baby-medical-form" key={editing?.id ?? "new"} onSubmit={(event) => void save(event)}>
        <label>Loại hồ sơ<select value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(kinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <div className="medical-form-grid"><label>Tiêu đề<input name="title" required maxLength={120} placeholder={kinds[kind]} defaultValue={editing?.title ?? ""} /></label><label>Trạng thái<select name="status" defaultValue={editing?.status ?? "completed"}><option value="completed">Đã thực hiện</option><option value="planned">Đã lên lịch</option></select></label><label>Ngày giờ<input name="occurredAt" type="datetime-local" required defaultValue={editing ? dateTimeInput(editing.occurredAt) : localDateTime()} /></label><label>Hẹn tiếp theo<input name="nextDueAt" type="datetime-local" defaultValue={dateTimeInput(editing?.nextDueAt ?? null)} /></label><label>Nơi thực hiện<input name="provider" maxLength={160} defaultValue={editing?.provider ?? ""} /></label><label>Bác sĩ<input name="clinician" maxLength={160} defaultValue={editing?.clinician ?? ""} /></label></div>
        {kind === "vaccination" ? <div className="medical-form-grid"><label>Tên vắc-xin<input name="vaccine" required defaultValue={String(editing?.details.vaccine ?? "")} /></label><label>Mũi/liều<input name="dose" defaultValue={String(editing?.details.dose ?? "")} /></label><label className="medical-wide">Phản ứng sau tiêm<input name="reaction" defaultValue={String(editing?.details.reaction ?? "")} /></label></div> : null}
        {kind === "allergy" ? <div className="medical-form-grid"><label>Tác nhân<input name="allergen" required defaultValue={String(editing?.details.allergen ?? "")} /></label><label>Mức độ<select name="severity" defaultValue={String(editing?.details.severity ?? "unknown")}><option value="unknown">Chưa rõ</option><option value="mild">Nhẹ</option><option value="moderate">Vừa</option><option value="severe">Nặng</option></select></label><label className="medical-wide">Phản ứng<input name="reaction" defaultValue={String(editing?.details.reaction ?? "")} /></label></div> : null}
        {kind === "visit" ? <div className="medical-form-grid"><label>Cân nặng (g)<input name="weightG" type="number" inputMode="numeric" defaultValue={String(editing?.details.weightG ?? "")} /></label><label>Chiều dài (cm)<input name="lengthCm" type="number" inputMode="decimal" step="0.1" defaultValue={String(editing?.details.lengthCm ?? "")} /></label><label>Vòng đầu (cm)<input name="headCm" type="number" inputMode="decimal" step="0.1" defaultValue={String(editing?.details.headCm ?? "")} /></label><label>Nhiệt độ (°C)<input name="temperatureC" type="number" inputMode="decimal" step="0.1" defaultValue={String(editing?.details.temperatureC ?? "")} /></label></div> : null}
        {kind === "prescription" ? <div className="medical-form-grid"><label>Tên thuốc<input name="medicine" required defaultValue={String((editing?.details.medicines as Array<Record<string, unknown>> | undefined)?.[0]?.name ?? "")} /></label><label>Liều<input name="dose" defaultValue={String((editing?.details.medicines as Array<Record<string, unknown>> | undefined)?.[0]?.dose ?? "")} /></label><label>Số lần<input name="frequency" defaultValue={String((editing?.details.medicines as Array<Record<string, unknown>> | undefined)?.[0]?.frequency ?? "")} /></label><label>Cách dùng<input name="instructions" defaultValue={String((editing?.details.medicines as Array<Record<string, unknown>> | undefined)?.[0]?.instructions ?? "")} /></label></div> : null}
        {!new Set(["vaccination", "allergy", "visit", "prescription"]).has(kind) ? <div className="medical-form-grid"><label>Kết quả<input name="result" defaultValue={String(editing?.details.result ?? "")} /></label><label>Theo dõi tiếp<input name="followUp" defaultValue={String(editing?.details.followUp ?? "")} /></label></div> : null}
        <label className="medical-notes">Ghi chú<textarea name="notes" rows={3} maxLength={2000} defaultValue={editing?.notes ?? ""} /></label><label className="medical-files">Ảnh hoặc PDF<input name="documents" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" /><small>Tối đa 6 file, 15 MB/file.</small></label>
        <button className="health-save" disabled={status === "saving"}>{status === "saving" ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Lưu hồ sơ"}</button>
      </form> : null}
      <div className="baby-medical-timeline">{records.map((record) => {
        const detail = detailSummary(record);
        return <article key={record.id}><small>{kinds[record.kind]} · {record.status === "planned" ? "sắp tới" : "đã xong"}</small><strong>{record.title}</strong><time>{displayDate(record.occurredAt)}</time>{detail ? <p>{detail}</p> : null}{record.nextDueAt ? <p><b>Hẹn tiếp:</b> {displayDate(record.nextDueAt)}</p> : null}{record.provider ? <p>{record.provider}{record.clinician ? ` · ${record.clinician}` : ""}</p> : null}{record.notes ? <p>{record.notes}</p> : null}{record.documents?.map((document) => <a key={document.id} href={`/api/baby/medical/documents/${document.id}`} target="_blank" rel="noreferrer">{(document.mimeType ?? document.mime_type) === "application/pdf" ? "PDF" : "Ảnh"} · {document.originalFilename ?? document.original_filename}</a>)}<button type="button" className="medical-edit" aria-label={`Sửa ${record.title}`} onClick={() => startEdit(record)}>Sửa</button></article>;
      })}</div>
      {!records.length && status !== "loading" ? <p className="empty-state">Chưa có hồ sơ. Khi Bé chào đời, thêm phiếu ra viện hoặc lịch khám đầu tiên tại đây.</p> : null}
      <p className="medical-status" aria-live="polite">{status === "error" ? "Chưa tải hoặc lưu được. Hãy thử lại khi mạng ổn định." : "Lịch tiêm tại đây theo phiếu hẹn của cơ sở y tế, không thay lời dặn của bác sĩ."}</p>
    </section>
  </main>;
}
