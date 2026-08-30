import { verifySessionCookie } from "../../../lib/portal-auth";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function reply(body: Record<string, string>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" }
  });
}

export async function POST(request: Request): Promise<Response> {
  const sessionSecret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const session = cookieValue(request.headers.get("cookie"), "embe_session");
  if (!sessionSecret || !verifySessionCookie(session, sessionSecret)) {
    return reply({ error: "unauthorized" }, 401);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  if (!input || typeof input !== "object") return reply({ error: "invalid_request" }, 400);

  const value = input as Record<string, unknown>;
  const content = typeof value.content === "string" ? value.content.trim() : "";
  const authorRole = value.authorRole;
  const idempotencyKey = value.idempotencyKey;
  if (
    content.length < 1 || content.length > 1000 ||
    (authorRole !== "father" && authorRole !== "mother") ||
    typeof idempotencyKey !== "string" || !UUID_V4.test(idempotencyKey)
  ) {
    return reply({ error: "invalid_request" }, 400);
  }

  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return reply({ error: "temporarily_unavailable" }, 503);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/rpc/embe_submit_journal`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        p_idempotency_key: idempotencyKey,
        p_content: content,
        p_author_role: authorRole
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return reply({ error: "temporarily_unavailable" }, 503);
    return reply({ status: "accepted" }, 202);
  } catch {
    return reply({ error: "temporarily_unavailable" }, 503);
  }
}
