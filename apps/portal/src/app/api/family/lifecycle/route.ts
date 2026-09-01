import { verifySessionCookie } from "../../../../lib/portal-auth";
import { authorizeMutation } from "../../../../lib/photo-upload-server";

const METHODS = new Set(["vaginal", "planned_c_section", "emergency_c_section", "assisted", "other"]);
const BODY_LIMIT = 8192;

type LifecycleRecord = {
  birthOccurredAt: string | null;
  birthMethod: string | null;
  gestationalWeeks: number | null;
  gestationalDays: number | null;
  birthWeightG: number | null;
  birthLengthCm: number | null;
  birthHeadCm: number | null;
  birthFacility: string | null;
  birthClinician: string | null;
  premature: boolean;
  lowBirthWeight: boolean;
  specialMonitoring: boolean;
  specialMonitoringNotes: string | null;
  dischargedAt: string | null;
  dischargeNotes: string | null;
  hasBirthRecord: boolean;
};

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie"), "embe_session"), secret));
}

function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function timestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 40) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function boundedNumber(value: unknown, min: number, max: number, integer = false): number | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  return value;
}

function shortText(value: unknown, maximum: number): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean.length > 0 && clean.length <= maximum ? clean : undefined;
}

function normalize(value: unknown): LifecycleRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const birthOccurredAt = timestamp(row.birth_occurred_at);
  const dischargedAt = timestamp(row.discharged_at);
  const birthFacility = shortText(row.birth_facility, 160);
  const birthClinician = shortText(row.birth_clinician, 160);
  const specialMonitoringNotes = shortText(row.special_monitoring_notes, 1000);
  const dischargeNotes = shortText(row.discharge_notes, 2000);
  if ([birthOccurredAt, dischargedAt, birthFacility, birthClinician, specialMonitoringNotes, dischargeNotes].includes(undefined)) return null;
  if (row.birth_method !== null && (typeof row.birth_method !== "string" || !METHODS.has(row.birth_method))) return null;
  const gestationalWeeks = boundedNumber(row.gestational_weeks, 20, 45, true);
  const gestationalDays = boundedNumber(row.gestational_days, 0, 6, true);
  const birthWeightG = boundedNumber(row.birth_weight_g, 300, 7000, true);
  const birthLengthCm = boundedNumber(row.birth_length_cm, 20, 70);
  const birthHeadCm = boundedNumber(row.birth_head_cm, 20, 50);
  if ([gestationalWeeks, gestationalDays, birthWeightG, birthLengthCm, birthHeadCm].includes(undefined)) return null;
  if ([row.premature, row.low_birth_weight, row.special_monitoring, row.has_birth_record].some((item) => typeof item !== "boolean")) return null;
  return {
    birthOccurredAt: birthOccurredAt as string | null,
    birthMethod: row.birth_method as string | null,
    gestationalWeeks: gestationalWeeks as number | null,
    gestationalDays: gestationalDays as number | null,
    birthWeightG: birthWeightG as number | null,
    birthLengthCm: birthLengthCm as number | null,
    birthHeadCm: birthHeadCm as number | null,
    birthFacility: birthFacility as string | null,
    birthClinician: birthClinician as string | null,
    premature: row.premature as boolean,
    lowBirthWeight: row.low_birth_weight as boolean,
    specialMonitoring: row.special_monitoring as boolean,
    specialMonitoringNotes: specialMonitoringNotes as string | null,
    dischargedAt: dischargedAt as string | null,
    dischargeNotes: dischargeNotes as string | null,
    hasBirthRecord: row.has_birth_record as boolean
  };
}

async function callRpc(name: string, body: Record<string, unknown>): Promise<LifecycleRecord | null> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { apikey: secretKey, authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok ? normalize(await response.json()) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const record = await callRpc("embe_get_family_lifecycle", {});
  return record ? reply(record, 200) : reply({ error: "temporarily_unavailable" }, 503);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > BODY_LIMIT) return reply({ error: "invalid_request" }, 413);

  let value: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > BODY_LIMIT) return reply({ error: "invalid_request" }, 413);
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  if (!value || typeof value !== "object") return reply({ error: "invalid_request" }, 400);
  const allowed = new Set(["birthOccurredAt", "birthMethod", "gestationalWeeks", "gestationalDays", "birthWeightG", "birthLengthCm", "birthHeadCm", "birthFacility", "birthClinician", "premature", "lowBirthWeight", "specialMonitoring", "specialMonitoringNotes", "dischargedAt", "dischargeNotes"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return reply({ error: "invalid_request" }, 400);

  const birthOccurredAt = timestamp(value.birthOccurredAt);
  const birthMethod = shortText(value.birthMethod, 32);
  const gestationalWeeks = boundedNumber(value.gestationalWeeks, 20, 45, true);
  const gestationalDays = boundedNumber(value.gestationalDays, 0, 6, true);
  const birthWeightG = boundedNumber(value.birthWeightG, 300, 7000, true);
  const birthLengthCm = boundedNumber(value.birthLengthCm, 20, 70);
  const birthHeadCm = boundedNumber(value.birthHeadCm, 20, 50);
  const birthFacility = shortText(value.birthFacility, 160);
  const birthClinician = shortText(value.birthClinician, 160);
  const specialMonitoringNotes = shortText(value.specialMonitoringNotes, 1000);
  const dischargedAt = timestamp(value.dischargedAt);
  const dischargeNotes = shortText(value.dischargeNotes, 2000);
  const invalid = birthOccurredAt === undefined || birthOccurredAt === null || birthMethod === undefined || birthMethod === null || !METHODS.has(birthMethod)
    || [gestationalWeeks, gestationalDays, birthWeightG, birthLengthCm, birthHeadCm, birthFacility, birthClinician, specialMonitoringNotes, dischargedAt, dischargeNotes].includes(undefined)
    || ["premature", "lowBirthWeight", "specialMonitoring"].some((key) => typeof value[key] !== "boolean");
  if (invalid) return reply({ error: "invalid_request" }, 400);
  if (dischargedAt && new Date(dischargedAt) < new Date(birthOccurredAt as string)) {
    return reply({ error: "invalid_request" }, 400);
  }

  const record = await callRpc("embe_save_family_lifecycle", {
    p_birth_occurred_at: birthOccurredAt,
    p_birth_method: birthMethod,
    p_gestational_weeks: gestationalWeeks,
    p_gestational_days: gestationalDays,
    p_birth_weight_g: birthWeightG,
    p_birth_length_cm: birthLengthCm,
    p_birth_head_cm: birthHeadCm,
    p_birth_facility: birthFacility,
    p_birth_clinician: birthClinician,
    p_premature: value.premature,
    p_low_birth_weight: value.lowBirthWeight,
    p_special_monitoring: value.specialMonitoring,
    p_special_monitoring_notes: specialMonitoringNotes,
    p_discharged_at: dischargedAt,
    p_discharge_notes: dischargeNotes
  });
  return record ? reply(record, 200) : reply({ error: "temporarily_unavailable" }, 503);
}
