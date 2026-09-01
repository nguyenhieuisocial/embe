import { verifySessionCookie } from "../../../lib/portal-auth";
import { authorizeMutation } from "../../../lib/photo-upload-server";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOPICS = new Set(["ngu", "bu", "moi-truong", "hoi-dap"]);
const PERIODS = new Set([7, 14, 30]);

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie"), "embe_session"), secret));
}

function configuration(): { baseUrl: string; secretKey: string } | null {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  return baseUrl?.startsWith("https://") && secretKey ? { baseUrl: baseUrl.replace(/\/$/, ""), secretKey } : null;
}

function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

async function rpc(config: { baseUrl: string; secretKey: string }, name: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${config.baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST", cache: "no-store",
    headers: { apikey: config.secretKey, authorization: `Bearer ${config.secretKey}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2400) return reply({ error: "invalid_request" }, 413);
    input = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  if (
    typeof input.topic !== "string" || !TOPICS.has(input.topic) ||
    typeof input.days !== "number" || !Number.isInteger(input.days) || !PERIODS.has(input.days) ||
    typeof input.idempotencyKey !== "string" || !UUID_V4.test(input.idempotencyKey) ||
    (input.topic === "hoi-dap"
      ? typeof input.question !== "string" || input.question.trim().length < 1 || input.question.trim().length > 600
      : input.question !== undefined) ||
    Object.keys(input).some((key) => !["topic", "days", "question", "idempotencyKey"].includes(key))
  ) return reply({ error: "invalid_request" }, 400);
  const config = configuration();
  if (!config) return reply({ error: "temporarily_unavailable" }, 503);
  const question = input.topic === "hoi-dap" ? (input.question as string).trim() : null;
  try {
    const response = await rpc(config, "embe_submit_assistant_request", {
      p_idempotency_key: input.idempotencyKey, p_topic: input.topic, p_days: input.days,
      p_question: question
    });
    if (!response.ok) return reply({ error: "temporarily_unavailable" }, 503);
    const id = await response.json();
    return typeof id === "string" && UUID_V4.test(id)
      ? reply({ id, status: "pending" }, 202)
      : reply({ error: "temporarily_unavailable" }, 503);
  } catch {
    return reply({ error: "temporarily_unavailable" }, 503);
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID_V4.test(id)) return reply({ error: "invalid_request" }, 400);
  const config = configuration();
  if (!config) return reply({ error: "temporarily_unavailable" }, 503);
  try {
    const response = await rpc(config, "embe_get_assistant_response", { p_id: id });
    if (!response.ok) return reply({ error: "temporarily_unavailable" }, 503);
    const value = await response.json() as Record<string, unknown> | null;
    if (!value || !["pending", "processing", "completed", "failed"].includes(String(value.status))) {
      return reply({ error: "not_found" }, 404);
    }
    return reply({ status: value.status, ...(typeof value.answer === "string" ? { answer: value.answer } : {}) }, 200);
  } catch {
    return reply({ error: "temporarily_unavailable" }, 503);
  }
}
