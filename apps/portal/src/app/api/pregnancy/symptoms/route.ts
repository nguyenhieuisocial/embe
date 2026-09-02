import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../lib/portal-auth";

const SYMPTOMS = new Set([
  "bleeding", "severe_abdominal_pain", "severe_headache", "vision_change", "sudden_swelling",
  "fever", "fluid_leak", "reduced_fetal_movement", "persistent_vomiting", "other"
]);
const SEVERITIES = new Set(["mild", "moderate", "severe"]);
const STATUSES = new Set(["tracking", "resolved"]);
const MOODS = new Set(["difficult", "mixed", "okay", "good"]);
const WORRIES = new Set(["none", "some", "hard_to_manage"]);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

type SymptomEntry = {
  id: string; occurredAt: string; symptoms: string[]; severity: string; status: string;
  mood: string | null; worry: string | null; mentalNote: string; notes: string; createdAt: string;
};

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed >= new Date("2020-01-01T00:00:00.000Z")
    && parsed.getTime() <= Date.now() + 5 * 60_000;
}

function optionalChoice(value: unknown, choices: Set<string>): string | null | undefined {
  if (value === null || value === "") return null;
  return typeof value === "string" && choices.has(value) ? value : undefined;
}

function normalizedText(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.trim().length <= maximum ? value.trim() : undefined;
}

function normalizeEntry(value: unknown): SymptomEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const rawSymptoms = Array.isArray(row.symptoms) ? row.symptoms : null;
  const symptoms = rawSymptoms && rawSymptoms.length > 0 && rawSymptoms.length <= SYMPTOMS.size
    && rawSymptoms.every((item) => typeof item === "string" && SYMPTOMS.has(item))
    ? [...new Set(rawSymptoms as string[])] : null;
  const occurredAt = typeof row.occurred_at === "string" ? row.occurred_at : null;
  const createdAt = typeof row.created_at === "string" ? row.created_at : null;
  const mentalNote = normalizedText(row.mental_note, 500);
  const notes = normalizedText(row.notes, 1000);
  const mood = optionalChoice(row.mood, MOODS);
  const worry = optionalChoice(row.worry, WORRIES);
  if (!isUuidV4(row.id) || !occurredAt || !createdAt || !symptoms || !rawSymptoms || symptoms.length !== rawSymptoms.length
      || typeof row.severity !== "string" || !SEVERITIES.has(row.severity)
      || typeof row.status !== "string" || !STATUSES.has(row.status)
      || mood === undefined || worry === undefined || mentalNote === undefined || notes === undefined) return null;
  return { id: row.id, occurredAt, symptoms, severity: row.severity, status: row.status, mood, worry, mentalNote, notes, createdAt };
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "30");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_get_pregnancy_symptom_history", { p_limit: limit });
  if (error || !Array.isArray(data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const history = data.map(normalizeEntry);
  return history.some((entry) => entry === null)
    ? privateReply({ error: "temporarily_unavailable" }, 503)
    : privateReply({ history }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return privateReply({ error: "invalid_request" }, 413);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return privateReply({ error: "invalid_request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch { return privateReply({ error: "invalid_request" }, 400); }

  const allowed = new Set(["occurredAt", "symptoms", "severity", "status", "mood", "worry", "mentalNote", "notes"]);
  const rawSymptoms = Array.isArray(body.symptoms) ? body.symptoms : null;
  const symptoms = rawSymptoms && rawSymptoms.length > 0 && rawSymptoms.length <= SYMPTOMS.size
    && rawSymptoms.every((item) => typeof item === "string" && SYMPTOMS.has(item))
    ? [...new Set(rawSymptoms as string[])] : null;
  const mood = optionalChoice(body.mood, MOODS);
  const worry = optionalChoice(body.worry, WORRIES);
  const mentalNote = normalizedText(body.mentalNote, 500);
  const notes = normalizedText(body.notes, 1000);
  if (Object.keys(body).some((key) => !allowed.has(key)) || !validTimestamp(body.occurredAt)
      || !symptoms || !rawSymptoms || symptoms.length !== rawSymptoms.length
      || typeof body.severity !== "string" || !SEVERITIES.has(body.severity)
      || typeof body.status !== "string" || !STATUSES.has(body.status)
      || mood === undefined || worry === undefined || mentalNote === undefined || notes === undefined) {
    return privateReply({ error: "invalid_request" }, 400);
  }

  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_save_pregnancy_symptom_entry", {
    p_occurred_at: body.occurredAt, p_symptoms: symptoms, p_severity: body.severity,
    p_status: body.status, p_mood: mood, p_worry: worry, p_mental_note: mentalNote, p_notes: notes
  });
  const entry = normalizeEntry(Array.isArray(data) ? data[0] : data);
  return error || !entry ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ entry }, 201);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 512) return privateReply({ error: "invalid_request" }, 413);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return privateReply({ error: "invalid_request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (Object.keys(body).length !== 2 || !isUuidV4(body.id) || body.status !== "resolved") {
    return privateReply({ error: "invalid_request" }, 400);
  }
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_resolve_pregnancy_symptom_entry", { p_id: body.id });
  const entry = normalizeEntry(Array.isArray(data) ? data[0] : data);
  return error || !entry ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ entry }, 200);
}
