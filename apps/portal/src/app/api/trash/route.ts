import { authorizeMutation, isUuidV4, privateReply } from "../../../lib/photo-upload-server";
import { isTaskId } from "../../../lib/family-task-contract";
import { taskRpc } from "../../../lib/family-tasks-server";
import { verifySessionCookie } from "../../../lib/portal-auth";

type TrashKind = "task" | "medical" | "meal" | "expense";
type TrashItem = { kind: TrashKind; id: string; title: string; detail: string; deletedAt: string };

const UUID_KINDS = new Set<TrashKind>(["medical", "meal", "expense"]);
const RESTORE_RPC: Record<TrashKind, string> = {
  task: "embe_restore_family_task",
  medical: "embe_restore_pregnancy_medical_record_with_task",
  meal: "embe_restore_meal_analysis",
  expense: "embe_restore_family_expense"
};

function isTrashKind(value: unknown): value is TrashKind {
  return value === "task" || value === "medical" || value === "meal" || value === "expense";
}

function validTrashId(kind: TrashKind, id: unknown): id is string {
  return typeof id === "string" && (UUID_KINDS.has(kind) ? isUuidV4(id) : isTaskId(id));
}

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

function normalizeItem(value: unknown): TrashItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isTrashKind(row.kind) || !validTrashId(row.kind, row.id)
      || typeof row.title !== "string" || row.title.length < 1 || row.title.length > 120
      || typeof row.detail !== "string" || row.detail.length > 120
      || typeof row.deleted_at !== "string" || Number.isNaN(Date.parse(row.deleted_at))) return null;
  return { kind: row.kind, id: row.id, title: row.title, detail: row.detail, deletedAt: row.deleted_at };
}

async function boundedBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 512) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 512) return null;
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  try {
    const result = await taskRpc("embe_list_family_trash", {});
    if (!Array.isArray(result)) throw new Error("invalid trash list");
    return privateReply({ items: result.map(normalizeItem).filter((item): item is TrashItem => item !== null) }, 200);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const value = await boundedBody(request);
  if (!value) return privateReply({ error: "invalid_request" }, 400);
  if (Object.keys(value).length !== 2 || !isTrashKind(value.kind) || !validTrashId(value.kind, value.id)) {
    return privateReply({ error: "invalid_request" }, 400);
  }
  try {
    await taskRpc(RESTORE_RPC[value.kind], { p_id: value.id });
    return privateReply({ ok: true }, 200);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
