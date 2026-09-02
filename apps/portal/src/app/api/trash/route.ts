import { authorizeMutation, isUuidV4, privateReply } from "../../../lib/photo-upload-server";
import { isTaskId } from "../../../lib/family-task-contract";
import { taskRpc } from "../../../lib/family-tasks-server";
import { verifySessionCookie } from "../../../lib/portal-auth";

type TrashItem = { kind: "task" | "medical"; id: string; title: string; detail: string; deletedAt: string };

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
  if ((row.kind !== "task" && row.kind !== "medical") || typeof row.id !== "string"
      || (row.kind === "task" ? !isTaskId(row.id) : !isUuidV4(row.id))
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
  if (Object.keys(value).length !== 2 || typeof value.id !== "string"
      || (value.kind !== "task" && value.kind !== "medical")
      || (value.kind === "task" ? !isTaskId(value.id) : !isUuidV4(value.id))) {
    return privateReply({ error: "invalid_request" }, 400);
  }
  try {
    await taskRpc(value.kind === "task" ? "embe_restore_family_task" : "embe_restore_pregnancy_medical_record_with_task", { p_id: value.id });
    return privateReply({ ok: true }, 200);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
