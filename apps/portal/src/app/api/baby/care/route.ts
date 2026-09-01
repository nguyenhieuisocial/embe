import { verifySessionCookie } from "../../../../lib/portal-auth";
import { authorizeMutation } from "../../../../lib/photo-upload-server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["feeding", "pumping", "sleep", "diaper", "temperature", "care"]);
const CAREGIVERS = new Set(["mother", "father"]);

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
function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function time(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function optionalNote(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string" && value.length <= 500;
}
function validDetails(kind: string, value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const detail = value as Record<string, unknown>;
  if (!optionalNote(detail.note)) return false;
  if (kind === "feeding") {
    if (!exactKeys(detail, ["mode", "side", "amountMl", "milkType", "note"])) return false;
    if (!new Set(["breast", "bottle"]).has(String(detail.mode))) return false;
    if (detail.side !== undefined && detail.side !== null && !new Set(["left", "right", "both"]).has(String(detail.side))) return false;
    if (detail.amountMl !== undefined && detail.amountMl !== null && (typeof detail.amountMl !== "number" || !Number.isInteger(detail.amountMl) || detail.amountMl < 1 || detail.amountMl > 1000)) return false;
    return detail.milkType === undefined || detail.milkType === null || new Set(["breast_milk", "formula", "mixed", "other"]).has(String(detail.milkType));
  }
  if (kind === "pumping") {
    return exactKeys(detail, ["side", "amountMl", "note"])
      && new Set(["left", "right", "both"]).has(String(detail.side))
      && typeof detail.amountMl === "number" && Number.isInteger(detail.amountMl) && detail.amountMl >= 0 && detail.amountMl <= 2000;
  }
  if (kind === "sleep") return exactKeys(detail, ["nap", "note"]) && (detail.nap === undefined || typeof detail.nap === "boolean");
  if (kind === "diaper") {
    return exactKeys(detail, ["wet", "solid", "color", "consistency", "note"])
      && typeof detail.wet === "boolean" && typeof detail.solid === "boolean" && (detail.wet || detail.solid)
      && (detail.color === undefined || detail.color === null || typeof detail.color === "string" && detail.color.length <= 40)
      && (detail.consistency === undefined || detail.consistency === null || typeof detail.consistency === "string" && detail.consistency.length <= 40);
  }
  if (kind === "temperature") {
    return exactKeys(detail, ["temperatureC", "note"])
      && typeof detail.temperatureC === "number" && Number.isFinite(detail.temperatureC)
      && detail.temperatureC >= 34 && detail.temperatureC <= 43;
  }
  if (kind === "care") {
    return exactKeys(detail, ["action", "medicineName", "dose", "note"])
      && new Set(["bath", "cord", "vitamin", "medicine", "other"]).has(String(detail.action))
      && (detail.medicineName === undefined || detail.medicineName === null || typeof detail.medicineName === "string" && detail.medicineName.length <= 100)
      && (detail.dose === undefined || detail.dose === null || typeof detail.dose === "string" && detail.dose.length <= 80);
  }
  return false;
}

function normalize(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const occurredAt = time(row.occurred_at);
  const endedAt = row.ended_at === null ? null : time(row.ended_at);
  if (typeof row.id !== "string" || !UUID.test(row.id) || typeof row.kind !== "string" || !KINDS.has(row.kind)
    || !occurredAt || row.ended_at !== null && !endedAt || typeof row.caregiver !== "string" || !CAREGIVERS.has(row.caregiver)
    || !validDetails(row.kind, row.details) || !new Set(["pending", "processing", "synced", "failed"]).has(String(row.sync_status))
    || row.babybuddy_id !== null && (!Number.isInteger(row.babybuddy_id) || Number(row.babybuddy_id) < 1)) return null;
  return { id: row.id, kind: row.kind, occurredAt, endedAt, caregiver: row.caregiver,
    details: row.details, syncStatus: row.sync_status, babybuddyId: row.babybuddy_id };
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown | null> {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !key) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok ? response.json() : null;
  } catch { return null; }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const day = new URL(request.url).searchParams.get("day");
  if (!isDay(day)) return reply({ error: "invalid_request" }, 400);
  const raw = await rpc("embe_list_baby_care_events", { p_day: day });
  if (!Array.isArray(raw)) return reply({ error: "temporarily_unavailable" }, 503);
  const events = raw.map(normalize);
  return events.some((item) => item === null) ? reply({ error: "temporarily_unavailable" }, 503) : reply({ events }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let value: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return reply({ error: "invalid_request" }, 413);
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch { return reply({ error: "invalid_request" }, 400); }
  const occurredAt = time(value?.occurredAt);
  if (!value || !exactKeys(value, ["idempotencyKey", "kind", "occurredAt", "endedAt", "caregiver", "details"])
    || typeof value.idempotencyKey !== "string" || !UUID.test(value.idempotencyKey)
    || typeof value.kind !== "string" || !KINDS.has(value.kind) || !occurredAt
    || value.endedAt !== undefined && value.endedAt !== null && !time(value.endedAt)
    || typeof value.caregiver !== "string" || !CAREGIVERS.has(value.caregiver)
    || !validDetails(value.kind, value.details)) return reply({ error: "invalid_request" }, 400);
  const endedAt = value.endedAt ? time(value.endedAt) : null;
  if (endedAt && new Date(endedAt) < new Date(occurredAt)) return reply({ error: "invalid_request" }, 400);
  const raw = await rpc("embe_create_baby_care_event", {
    p_idempotency_key: value.idempotencyKey, p_kind: value.kind, p_occurred_at: occurredAt,
    p_ended_at: endedAt, p_caregiver: value.caregiver, p_details: value.details
  });
  const event = normalize(Array.isArray(raw) ? raw[0] : raw);
  return event ? reply({ event }, 201) : reply({ error: "temporarily_unavailable" }, 503);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let value: Record<string, unknown>;
  try { value = JSON.parse(await request.text()) as Record<string, unknown>; }
  catch { return reply({ error: "invalid_request" }, 400); }
  const endedAt = time(value?.endedAt);
  if (!value || !exactKeys(value, ["id", "endedAt"]) || typeof value.id !== "string" || !UUID.test(value.id) || !endedAt) {
    return reply({ error: "invalid_request" }, 400);
  }
  const raw = await rpc("embe_end_baby_care_event", { p_id: value.id, p_ended_at: endedAt });
  const event = normalize(Array.isArray(raw) ? raw[0] : raw);
  return event ? reply({ event }, 200) : reply({ error: "temporarily_unavailable" }, 503);
}
