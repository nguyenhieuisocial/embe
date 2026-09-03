import { authorizeMutation, isUuidV4, privateReply } from "../../../lib/photo-upload-server";
import {
  isIsoDate, isTaskId, LINK_TARGETS, OWNER_ROLES, REPEAT_RULES, TASK_CATEGORIES
} from "../../../lib/family-task-contract";
import { getFamilyTasks, taskRpc } from "../../../lib/family-tasks-server";
import { verifySessionCookie } from "../../../lib/portal-auth";
import { revalidateFamilyViews } from "../../../lib/family-view-revalidation";

const owners = new Set<string>(OWNER_ROLES);
const categories = new Set<string>(TASK_CATEGORIES);
const links = new Set<string>(LINK_TARGETS);
const repeats = new Set<string>(REPEAT_RULES);

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 4096) return null;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return null;
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function validTime(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}

type TaskWrite = {
  title: string; note: string; ownerRole: string; category: string; linkTarget: string;
  dueOn: string; dueTime: string | null; repeatRule: string;
};

function validTaskWrite(value: Record<string, unknown>): value is Record<string, unknown> & TaskWrite {
  return typeof value.title === "string" && value.title.trim().length >= 1 && value.title.trim().length <= 120
    && typeof value.note === "string" && value.note.trim().length <= 500
    && typeof value.ownerRole === "string" && owners.has(value.ownerRole)
    && typeof value.category === "string" && categories.has(value.category)
    && typeof value.linkTarget === "string" && links.has(value.linkTarget)
    && isIsoDate(value.dueOn) && validTime(value.dueTime)
    && typeof value.repeatRule === "string" && repeats.has(value.repeatRule);
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function writeRpcBody(input: TaskWrite): Record<string, unknown> {
  return {
    p_title: input.title.trim(), p_note: input.note.trim(), p_owner_role: input.ownerRole,
    p_category: input.category, p_link_target: input.linkTarget, p_due_on: input.dueOn,
    p_due_time: input.dueTime, p_repeat_rule: input.repeatRule
  };
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const query = new URL(request.url).searchParams;
  const from = query.get("from"); const to = query.get("to");
  if (!isIsoDate(from) || !isIsoDate(to)) return privateReply({ error: "invalid_request" }, 400);
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (span < 0 || span > 41) return privateReply({ error: "invalid_request" }, 400);
  try { return privateReply({ tasks: await getFamilyTasks(from, to) }, 200); }
  catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeMutation(request);
  if (auth) return privateReply({ error: auth === 401 ? "unauthorized" : "forbidden" }, auth);
  const input = await body(request);
  if (!input || !isUuidV4(input.idempotencyKey) || !validTaskWrite(input)
      || !onlyKeys(input, ["idempotencyKey", "title", "note", "ownerRole", "category", "linkTarget", "dueOn", "dueTime", "repeatRule"])) return privateReply({ error: "invalid_request" }, 400);
  try {
    const result = await taskRpc("embe_create_family_task", { p_idempotency_key: input.idempotencyKey, ...writeRpcBody(input) });
    if (!result || typeof result !== "object" || !isTaskId((result as Record<string, unknown>).id)) throw new Error();
    revalidateFamilyViews();
    return privateReply({ id: (result as Record<string, unknown>).id }, 201);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = authorizeMutation(request);
  if (auth) return privateReply({ error: auth === 401 ? "unauthorized" : "forbidden" }, auth);
  const input = await body(request);
  if (!input || !isTaskId(input.id) || (input.action !== "complete" && input.action !== "update")) return privateReply({ error: "invalid_request" }, 400);
  try {
    if (input.action === "complete") {
      if (!isIsoDate(input.occurrenceOn) || typeof input.completed !== "boolean"
          || typeof input.completedBy !== "string" || !owners.has(input.completedBy)
          || !onlyKeys(input, ["action", "id", "occurrenceOn", "completed", "completedBy"])) return privateReply({ error: "invalid_request" }, 400);
      await taskRpc("embe_set_family_task_completion", {
        p_id: input.id, p_occurrence_on: input.occurrenceOn,
        p_completed: input.completed, p_completed_by: input.completedBy
      });
    } else {
      if (!validTaskWrite(input) || !onlyKeys(input, ["action", "id", "title", "note", "ownerRole", "category", "linkTarget", "dueOn", "dueTime", "repeatRule"])) return privateReply({ error: "invalid_request" }, 400);
      await taskRpc("embe_update_family_task", { p_id: input.id, ...writeRpcBody(input) });
    }
    revalidateFamilyViews();
    return privateReply({ ok: true }, 200);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = authorizeMutation(request);
  if (auth) return privateReply({ error: auth === 401 ? "unauthorized" : "forbidden" }, auth);
  const input = await body(request);
  if (!input || !isTaskId(input.id) || Object.keys(input).some((key) => key !== "id")) return privateReply({ error: "invalid_request" }, 400);
  try {
    await taskRpc("embe_delete_family_task", { p_id: input.id });
    revalidateFamilyViews();
    return privateReply({ ok: true }, 200);
  }
  catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
