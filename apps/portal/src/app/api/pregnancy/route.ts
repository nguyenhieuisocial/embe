import { dailyChecklist } from "../../../lib/pregnancy-content";
import { verifySessionCookie } from "../../../lib/portal-auth";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_TASK_IDS = new Set<string>(dailyChecklist.map((task) => task.id));

type PregnancyState = {
  dueDate: string | null;
  completed: string[];
  hasProfile: boolean;
  hasDayState: boolean;
};

function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" }
  });
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const session = cookieValue(request.headers.get("cookie"), "embe_session");
  return Boolean(secret && verifySessionCookie(session, secret));
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeState(value: unknown): PregnancyState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  const dueDate = state.due_date;
  const completed = state.completed;
  if (
    (dueDate !== null && !isIsoDate(dueDate)) ||
    !Array.isArray(completed) ||
    completed.some((taskId) => typeof taskId !== "string" || !ALLOWED_TASK_IDS.has(taskId)) ||
    typeof state.has_profile !== "boolean" ||
    typeof state.has_day_state !== "boolean"
  ) {
    return null;
  }

  return {
    dueDate: dueDate as string | null,
    completed: [...new Set(completed as string[])],
    hasProfile: state.has_profile as boolean,
    hasDayState: state.has_day_state as boolean
  };
}

async function callRpc(name: string, body: Record<string, unknown>): Promise<PregnancyState | null> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    return normalizeState(await response.json());
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);

  const day = new URL(request.url).searchParams.get("day");
  if (!isIsoDate(day)) return reply({ error: "invalid_request" }, 400);

  const state = await callRpc("embe_get_pregnancy_state", { p_day: day });
  return state ? reply(state, 200) : reply({ error: "temporarily_unavailable" }, 503);
}

export async function PATCH(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return reply({ error: "invalid_request" }, 413);
  }

  let input: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4096) {
      return reply({ error: "invalid_request" }, 413);
    }
    input = JSON.parse(rawBody);
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  if (!input || typeof input !== "object") return reply({ error: "invalid_request" }, 400);

  const value = input as Record<string, unknown>;
  const writesDueDate = Object.hasOwn(value, "dueDate");
  const writesCompleted = Object.hasOwn(value, "completed");
  if (!isIsoDate(value.day) || (!writesDueDate && !writesCompleted)) {
    return reply({ error: "invalid_request" }, 400);
  }
  if (writesDueDate && value.dueDate !== null && !isIsoDate(value.dueDate)) {
    return reply({ error: "invalid_request" }, 400);
  }

  const completed = writesCompleted ? value.completed : null;
  if (
    writesCompleted &&
    (!Array.isArray(completed) ||
      completed.length > ALLOWED_TASK_IDS.size ||
      completed.some((taskId) => typeof taskId !== "string" || !ALLOWED_TASK_IDS.has(taskId)) ||
      new Set(completed).size !== completed.length)
  ) {
    return reply({ error: "invalid_request" }, 400);
  }

  const state = await callRpc("embe_save_pregnancy_state", {
    p_day: value.day,
    p_due_date: writesDueDate ? value.dueDate : null,
    p_completed: writesCompleted ? completed : null,
    p_write_due_date: writesDueDate,
    p_write_completed: writesCompleted
  });
  return state ? reply(state, 200) : reply({ error: "temporarily_unavailable" }, 503);
}
