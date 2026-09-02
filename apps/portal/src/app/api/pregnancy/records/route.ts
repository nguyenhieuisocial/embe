import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { MEDICAL_KINDS, medicalInsights, normalizeMedicalRecord } from "../../../../lib/pregnancy-medical";
import { verifySessionCookie } from "../../../../lib/portal-auth";

function session(request: Request): boolean {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  return Boolean(process.env.EMBE_PORTAL_SESSION_SECRET && verifySessionCookie(cookie, process.env.EMBE_PORTAL_SESSION_SECRET));
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function validPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  const measurements = input.measurements;
  const medicines = input.medicines;
  return (input.id === null || input.id === undefined || isUuidV4(input.id))
    && typeof input.kind === "string" && MEDICAL_KINDS.has(input.kind)
    && (input.status === "planned" || input.status === "completed") && validDate(input.occurredAt)
    && typeof input.title === "string" && input.title.trim().length >= 1 && input.title.trim().length <= 100
    && typeof input.provider === "string" && input.provider.length <= 120
    && typeof input.clinician === "string" && input.clinician.length <= 100
    && typeof input.notes === "string" && input.notes.length <= 2000
    && (input.gestationalWeek === null || Number.isInteger(input.gestationalWeek) && Number(input.gestationalWeek) >= 1 && Number(input.gestationalWeek) <= 42)
    && (input.nextAppointmentAt === null || validDate(input.nextAppointmentAt))
    && Boolean(measurements && typeof measurements === "object" && !Array.isArray(measurements)
      && Object.values(measurements).every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 10000))
    && Array.isArray(medicines) && medicines.length <= 12 && medicines.every((item) => {
      if (!item || typeof item !== "object") return false;
      const medicine = item as Record<string, unknown>;
      return typeof medicine.name === "string" && medicine.name.trim().length >= 1 && medicine.name.length <= 100
        && typeof medicine.dose === "string" && medicine.dose.length <= 80
        && typeof medicine.frequency === "string" && medicine.frequency.length <= 80
        && typeof medicine.instructions === "string" && medicine.instructions.length <= 200;
    });
}

export async function GET(request: Request): Promise<Response> {
  if (!session(request)) return privateReply({ error: "unauthorized" }, 401);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const result = await store.rpc("embe_list_pregnancy_medical_records");
    if (result.error || !Array.isArray(result.data)) throw new Error("records unavailable");
    const records = result.data.flatMap((value: unknown) => { const record = normalizeMedicalRecord(value); return record ? [record] : []; });
    return privateReply({ records, insights: medicalInsights(records), notice: "EmBe chỉ sắp xếp dữ liệu đã nhập; không đọc kết quả thay bác sĩ." }, 200);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let input: unknown; try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!validPayload(input)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const result = await store.rpc("embe_save_pregnancy_medical_record_with_task", {
      p_id: input.id ?? null, p_kind: input.kind, p_status: input.status, p_occurred_at: input.occurredAt,
      p_title: input.title, p_provider: input.provider, p_clinician: input.clinician, p_notes: input.notes,
      p_gestational_week: input.gestationalWeek, p_next_appointment_at: input.nextAppointmentAt,
      p_measurements: input.measurements, p_medicines: input.medicines
    });
    if (result.error || !isUuidV4(result.data)) throw new Error("save unavailable");
    return privateReply({ id: result.data }, input.id ? 200 : 201);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
