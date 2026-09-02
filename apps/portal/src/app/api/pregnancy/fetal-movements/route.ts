import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../lib/portal-auth";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
type MovementSession = { id: string; startedAt: string; endedAt: string | null; movementCount: number; note: string; createdAt: string };

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
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= new Date("2020-01-01T00:00:00.000Z") && date.getTime() <= Date.now() + 5 * 60_000;
}
function normalizeSession(value: unknown): MovementSession | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isUuidV4(row.id) || typeof row.started_at !== "string"
    || !(row.ended_at === null || typeof row.ended_at === "string")
    || !Number.isInteger(row.movement_count) || Number(row.movement_count) < 0 || Number(row.movement_count) > 500
    || typeof row.note !== "string" || row.note.length > 500 || typeof row.created_at !== "string") return null;
  return { id: row.id, startedAt: row.started_at, endedAt: row.ended_at, movementCount: Number(row.movement_count), note: row.note, createdAt: row.created_at };
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "20");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_list_fetal_movement_sessions", { p_limit: limit });
  if (error || !Array.isArray(data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const sessions = data.map(normalizeSession);
  return sessions.some((session) => session === null) ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ sessions }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1024) return privateReply({ error: "invalid_request" }, 413);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return privateReply({ error: "invalid_request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  const action = body.action;
  const allowed = action === "finish" ? new Set(["action", "id", "at", "note"]) : new Set(["action", "id", "at"]);
  const note = action === "finish" && typeof body.note === "string" && body.note.trim().length <= 500 ? body.note.trim() : "";
  if (!new Set(["start", "movement", "finish"]).has(String(action)) || Object.keys(body).some((key) => !allowed.has(key))
    || !isUuidV4(body.id) || !validTimestamp(body.at)
    || (action === "finish" && (typeof body.note !== "string" || body.note.trim().length > 500))) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const call = action === "start"
    ? ["embe_start_fetal_movement_session", { p_id: body.id, p_started_at: body.at }]
    : action === "movement"
      ? ["embe_record_fetal_movement", { p_id: body.id, p_recorded_at: body.at }]
      : ["embe_finish_fetal_movement_session", { p_id: body.id, p_ended_at: body.at, p_note: note }];
  const { data, error } = await store.rpc(call[0] as string, call[1] as Record<string, unknown>);
  const session = normalizeSession(Array.isArray(data) ? data[0] : data);
  return error || !session ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ session }, 200);
}
