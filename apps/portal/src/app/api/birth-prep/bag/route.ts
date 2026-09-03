import { HOSPITAL_BAG_IDS } from "../../../../lib/hospital-bag";
import { authorizeMutation } from "../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../lib/portal-auth";

const allowed = new Set<string>(HOSPITAL_BAG_IDS);

function session(request: Request): boolean {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  return Boolean(process.env.EMBE_PORTAL_SESSION_SECRET
    && verifySessionCookie(cookie, process.env.EMBE_PORTAL_SESSION_SECRET));
}

function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
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

function normalize(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && allowed.has(item))
    ? Array.from(new Set(value)) : null;
}

export async function GET(request: Request): Promise<Response> {
  if (!session(request)) return reply({ error: "unauthorized" }, 401);
  const completed = normalize(await rpc("embe_get_hospital_bag", {}));
  return completed ? reply({ completed }, 200) : reply({ error: "temporarily_unavailable" }, 503);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let input: unknown;
  try { input = await request.json(); } catch { return reply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some((key) => key !== "completed")) return reply({ error: "invalid_request" }, 400);
  const completed = normalize((input as Record<string, unknown>).completed);
  if (!completed) return reply({ error: "invalid_request" }, 400);
  const saved = normalize(await rpc("embe_save_hospital_bag", { p_completed: completed }));
  return saved ? reply({ completed: saved }, 200) : reply({ error: "temporarily_unavailable" }, 503);
}
