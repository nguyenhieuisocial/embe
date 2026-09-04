export const MEDICAL_KINDS = new Set(["appointment", "ultrasound", "laboratory", "prescription", "other"]);
export const MEDICAL_BUCKET = "embe-medical-records";
export const MEDICAL_MAX_BYTES = 15_000_000;
export const MEDICAL_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type MedicalMedicine = { name: string; ingredients?: string; dose: string; frequency: string; instructions: string };
export type MedicalDocument = { id: string; originalFilename: string; mimeType: string; byteSize: number; createdAt: string };
export type MedicalRecord = {
  id: string; kind: string; status: "planned" | "completed"; occurredAt: string; title: string;
  provider: string; clinician: string; notes: string; gestationalWeek: number | null;
  nextAppointmentAt: string | null; measurements: Record<string, number>; medicines: MedicalMedicine[];
  documents: MedicalDocument[];
};

export type MedicalUpcoming = MedicalRecord & { followUpFromCompleted: boolean };

export type AppointmentWorkspace = { questions: string[]; checklist: string[]; outcome: string };

export const APPOINTMENT_CHECKLIST = [
  { id: "schedule", label: "Kiểm tra lại giờ và nơi khám" },
  { id: "papers", label: "Mang giấy tờ và sổ khám" },
  { id: "results", label: "Mang kết quả siêu âm/xét nghiệm gần nhất" }
] as const;

const APPOINTMENT_WORKSPACE_PREFIX = "EMBE_APPOINTMENT_V1\n";
const appointmentChecklistIds = new Set<string>(APPOINTMENT_CHECKLIST.map((item) => item.id));

export function encodeAppointmentWorkspace(workspace: AppointmentWorkspace): string {
  const questions = workspace.questions.map((question) => question.trim()).filter(Boolean).slice(0, 12);
  const checklist = [...new Set(workspace.checklist.filter((item) => appointmentChecklistIds.has(item)))];
  const outcome = workspace.outcome.trim();
  const encoded = APPOINTMENT_WORKSPACE_PREFIX + JSON.stringify({ questions, checklist, outcome });
  if (questions.some((question) => question.length > 200) || outcome.length > 1000 || encoded.length > 2000) {
    throw new Error("appointment_workspace_too_large");
  }
  return encoded;
}

export function decodeAppointmentWorkspace(notes: string): AppointmentWorkspace {
  if (!notes.startsWith(APPOINTMENT_WORKSPACE_PREFIX)) {
    return { questions: [], checklist: [], outcome: notes.trim() };
  }
  try {
    const value = JSON.parse(notes.slice(APPOINTMENT_WORKSPACE_PREFIX.length)) as Record<string, unknown>;
    const questions = Array.isArray(value.questions)
      ? value.questions.filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 200).slice(0, 12)
      : [];
    const checklist = Array.isArray(value.checklist)
      ? [...new Set(value.checklist.filter((item): item is string => typeof item === "string" && appointmentChecklistIds.has(item)))]
      : [];
    const outcome = typeof value.outcome === "string" && value.outcome.length <= 1000 ? value.outcome.trim() : "";
    return { questions, checklist, outcome };
  } catch {
    return { questions: [], checklist: [], outcome: "" };
  }
}

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length <= maximum ? value.trim() : null;
}

export function normalizeMedicalRecord(value: unknown): MedicalRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = boundedText(row.id, 36); const title = boundedText(row.title, 100);
  const provider = boundedText(row.provider, 120); const clinician = boundedText(row.clinician, 100);
  const notes = boundedText(row.notes, 2000); const occurredAt = boundedText(row.occurred_at ?? row.occurredAt, 40);
  if (!id || !title || provider === null || clinician === null || notes === null || !occurredAt
      || !MEDICAL_KINDS.has(String(row.kind)) || !["planned", "completed"].includes(String(row.status))) return null;
  const medicines = Array.isArray(row.medicines) ? row.medicines.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const medicine = item as Record<string, unknown>;
    const name = boundedText(medicine.name, 100); const ingredients = boundedText(medicine.ingredients ?? "", 1200);
    const dose = boundedText(medicine.dose, 80);
    const frequency = boundedText(medicine.frequency, 80); const instructions = boundedText(medicine.instructions, 200);
    return name && ingredients !== null && dose !== null && frequency !== null && instructions !== null
      ? [{ name, ingredients, dose, frequency, instructions }] : [];
  }) : [];
  const documents = Array.isArray(row.documents) ? row.documents.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const document = item as Record<string, unknown>;
    const documentId = boundedText(document.id, 36); const filename = boundedText(document.original_filename ?? document.originalFilename, 180);
    const mimeType = boundedText(document.mime_type ?? document.mimeType, 40);
    const createdAt = boundedText(document.created_at ?? document.createdAt, 40);
    return documentId && filename && mimeType && createdAt && typeof document.byte_size === "number"
      ? [{ id: documentId, originalFilename: filename, mimeType, byteSize: document.byte_size, createdAt }] : [];
  }) : [];
  const measurements = row.measurements && typeof row.measurements === "object"
    ? Object.fromEntries(Object.entries(row.measurements as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) : {};
  return {
    id, kind: String(row.kind), status: row.status as MedicalRecord["status"], occurredAt, title, provider, clinician, notes,
    gestationalWeek: typeof (row.gestational_week ?? row.gestationalWeek) === "number" ? Number(row.gestational_week ?? row.gestationalWeek) : null,
    nextAppointmentAt: typeof (row.next_appointment_at ?? row.nextAppointmentAt) === "string" ? String(row.next_appointment_at ?? row.nextAppointmentAt) : null,
    measurements, medicines, documents
  };
}

export function medicalInsights(records: MedicalRecord[], now = new Date()) {
  const upcoming = [
    ...records
      .filter((record) => record.status === "planned" && new Date(record.occurredAt) >= now)
      .map((record): MedicalUpcoming => ({ ...record, followUpFromCompleted: false })),
    ...records
      .filter((record) => record.status === "completed" && record.nextAppointmentAt
        && new Date(record.nextAppointmentAt) >= now)
      .map((record): MedicalUpcoming => ({
        ...record,
        occurredAt: record.nextAppointmentAt as string,
        followUpFromCompleted: true
      }))
  ].sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt))[0] ?? null;
  const activeMedicines = records.filter((record) => record.kind === "prescription" && record.status === "completed")
    .flatMap((record) => record.medicines);
  const completed = records.filter((record) => record.status === "completed");
  const questions: string[] = [];
  const latest = completed[0];
  if (latest && !latest.nextAppointmentAt) questions.push("Lần khám gần nhất chưa ghi ngày hẹn tiếp theo.");
  if (activeMedicines.some((medicine) => !medicine.dose || !medicine.frequency)) questions.push("Có thuốc chưa ghi đủ liều hoặc số lần dùng; hãy chép lại đúng đơn.");
  if (latest?.notes) questions.push("Xem lại ghi chú lần khám gần nhất trước khi chuẩn bị câu hỏi cho bác sĩ.");
  return { upcoming, activeMedicines, completedCount: completed.length, questions: questions.slice(0, 3) };
}
