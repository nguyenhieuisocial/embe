import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../lib/portal-auth";

const CATEGORIES = new Set(["pregnancy_visit", "test", "medicine", "baby_supply", "birth", "travel", "other"]);
const KINDS = new Set(["planned", "actual"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Entry = { id: string; incurredOn: string; kind: string; category: string; amountVnd: number; description: string; note: string; createdAt: string; updatedAt: string };

function cookieValue(header: string | null): string | undefined { return header?.split(";").map((part) => part.trim().split("=")).find(([key]) => key === "embe_session")?.slice(1).join("="); }
function authorized(request: Request): boolean { const secret = process.env.EMBE_PORTAL_SESSION_SECRET; return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret)); }
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number), date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function text(value: unknown, max: number, required = false): string | null {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) return null;
  return value.trim();
}
function normalize(value: unknown): Entry | null {
  if (!value || typeof value !== "object") return null; const row = value as Record<string, unknown>;
  if (!isUuidV4(row.id) || !validDate(row.incurred_on) || typeof row.kind !== "string" || !KINDS.has(row.kind)
    || typeof row.category !== "string" || !CATEGORIES.has(row.category) || !Number.isInteger(row.amount_vnd)
    || Number(row.amount_vnd) < 0 || Number(row.amount_vnd) > 1_000_000_000
    || text(row.description, 120, true) === null || text(row.note, 500) === null
    || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return null;
  return { id: row.id, incurredOn: row.incurred_on, kind: row.kind, category: row.category, amountVnd: Number(row.amount_vnd), description: String(row.description), note: String(row.note), createdAt: row.created_at, updatedAt: row.updated_at };
}
async function body(request: Request, max = 2048): Promise<Record<string, unknown> | null> {
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > max) return null; const parsed = JSON.parse(raw) as unknown; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_list_family_expenses", { p_limit: 200 });
  if (error || !Array.isArray(data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const entries = data.map(normalize);
  return entries.some((entry) => entry === null) ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ entries }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request); if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const input = await body(request); if (!input) return privateReply({ error: "invalid_request" }, 400);
  const description = text(input.description, 120, true), note = text(input.note, 500);
  const allowed = new Set(["id", "incurredOn", "kind", "category", "amountVnd", "description", "note"]);
  if (Object.keys(input).some((key) => !allowed.has(key)) || !isUuidV4(input.id) || !validDate(input.incurredOn)
    || typeof input.kind !== "string" || !KINDS.has(input.kind) || typeof input.category !== "string" || !CATEGORIES.has(input.category)
    || !Number.isInteger(input.amountVnd) || Number(input.amountVnd) < 0 || Number(input.amountVnd) > 1_000_000_000 || description === null || note === null) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_save_family_expense", { p_id: input.id, p_incurred_on: input.incurredOn, p_kind: input.kind, p_category: input.category, p_amount_vnd: input.amountVnd, p_description: description, p_note: note });
  const entry = normalize(Array.isArray(data) ? data[0] : data);
  return error || !entry ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ entry }, 201);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request); if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const input = await body(request, 256);
  if (!input || Object.keys(input).length !== 2 || !isUuidV4(input.id) || typeof input.deleted !== "boolean") return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_set_family_expense_deleted", { p_id: input.id, p_deleted: input.deleted });
  return error || data !== true ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ ok: true }, 200);
}
