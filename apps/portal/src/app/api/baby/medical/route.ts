import { verifySessionCookie } from "../../../../lib/portal-auth";
import { authorizeMutation } from "../../../../lib/photo-upload-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["discharge", "newborn_screening", "hearing", "eye", "visit", "diagnosis", "prescription", "allergy", "vaccination", "other"]);
const STATUSES = new Set(["planned", "completed"]);

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
function timestamp(value: unknown, nullable = false): string | null | undefined {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || value.length > 40) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
function textValue(value: unknown, max: number, required = false): string | undefined {
  if (typeof value !== "string" || value.length > max || required && !value.trim()) return undefined;
  return value.trim();
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function validDetails(kind: string, raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  const short = (item: unknown, max = 300) => item === null || typeof item === "string" && item.length <= max;
  if (kind === "vaccination") return exact(value, ["vaccine", "dose", "reaction"])
    && typeof value.vaccine === "string" && value.vaccine.trim().length > 0 && value.vaccine.length <= 120
    && short(value.dose, 40) && short(value.reaction, 500);
  if (kind === "prescription") return exact(value, ["medicines"])
    && Array.isArray(value.medicines) && value.medicines.length <= 20 && value.medicines.every((item) => {
      if (!item || typeof item !== "object") return false;
      const medicine = item as Record<string, unknown>;
      return exact(medicine, ["name", "dose", "frequency", "instructions"])
        && typeof medicine.name === "string" && medicine.name.trim().length > 0 && medicine.name.length <= 100
        && [medicine.dose, medicine.frequency, medicine.instructions].every((entry) => typeof entry === "string" && entry.length <= 200);
    });
  if (kind === "allergy") return exact(value, ["allergen", "reaction", "severity"])
    && typeof value.allergen === "string" && value.allergen.trim().length > 0 && value.allergen.length <= 120
    && short(value.reaction, 500) && (value.severity === null || new Set(["mild", "moderate", "severe", "unknown"]).has(String(value.severity)));
  if (kind === "visit") return exact(value, ["weightG", "lengthCm", "headCm", "temperatureC"])
    && (value.weightG === null || typeof value.weightG === "number" && Number.isInteger(value.weightG) && value.weightG >= 300 && value.weightG <= 40000)
    && (value.lengthCm === null || typeof value.lengthCm === "number" && value.lengthCm >= 20 && value.lengthCm <= 130)
    && (value.headCm === null || typeof value.headCm === "number" && value.headCm >= 20 && value.headCm <= 65)
    && (value.temperatureC === null || typeof value.temperatureC === "number" && value.temperatureC >= 34 && value.temperatureC <= 43);
  return exact(value, ["result", "followUp"]) && short(value.result, 1000) && short(value.followUp, 1000);
}

function normalize(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const occurredAt = timestamp(row.occurred_at);
  const nextDueAt = timestamp(row.next_due_at, true);
  if (typeof row.id !== "string" || !UUID.test(row.id) || typeof row.kind !== "string" || !KINDS.has(row.kind)
    || typeof row.status !== "string" || !STATUSES.has(row.status) || !occurredAt || nextDueAt === undefined
    || textValue(row.title, 120, true) === undefined || textValue(row.provider, 160) === undefined
    || textValue(row.clinician, 160) === undefined || textValue(row.notes, 2000) === undefined
    || !validDetails(row.kind, row.details) || !Array.isArray(row.documents)) return null;
  return { id: row.id, kind: row.kind, status: row.status, occurredAt, title: row.title,
    provider: row.provider, clinician: row.clinician, notes: row.notes, nextDueAt,
    details: row.details, documents: row.documents };
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok ? response.json() : null;
  } catch { return null; }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const raw = await rpc("embe_list_baby_medical_records", {});
  if (!Array.isArray(raw)) return reply({ error: "temporarily_unavailable" }, 503);
  const records = raw.map(normalize);
  return records.some((item) => item === null) ? reply({ error: "temporarily_unavailable" }, 503) : reply({ records }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let value: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 12_000) return reply({ error: "invalid_request" }, 413);
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch { return reply({ error: "invalid_request" }, 400); }
  if (!value || !exact(value, ["id", "kind", "status", "occurredAt", "title", "provider", "clinician", "notes", "nextDueAt", "details"])) return reply({ error: "invalid_request" }, 400);
  const occurredAt = timestamp(value.occurredAt);
  const nextDueAt = timestamp(value.nextDueAt, true);
  if (value.id !== undefined && (typeof value.id !== "string" || !UUID.test(value.id))
    || typeof value.kind !== "string" || !KINDS.has(value.kind)
    || typeof value.status !== "string" || !STATUSES.has(value.status)
    || !occurredAt || nextDueAt === undefined || textValue(value.title, 120, true) === undefined
    || textValue(value.provider, 160) === undefined || textValue(value.clinician, 160) === undefined
    || textValue(value.notes, 2000) === undefined || !validDetails(value.kind, value.details)) {
    return reply({ error: "invalid_request" }, 400);
  }
  const raw = await rpc("embe_save_baby_medical_record", {
    p_id: value.id ?? null, p_kind: value.kind, p_status: value.status, p_occurred_at: occurredAt,
    p_title: String(value.title).trim(), p_provider: String(value.provider).trim(),
    p_clinician: String(value.clinician).trim(), p_notes: String(value.notes).trim(),
    p_next_due_at: nextDueAt, p_details: value.details
  });
  const record = normalize(Array.isArray(raw) ? raw[0] : raw);
  return record ? reply({ record }, 201) : reply({ error: "temporarily_unavailable" }, 503);
}
