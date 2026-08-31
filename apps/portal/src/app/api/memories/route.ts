import { getMediaMemories } from "../../../lib/media";
import { verifySessionCookie } from "../../../lib/portal-auth";

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function integerParam(value: string | null, fallback: number, maximum: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : fallback;
}

export async function GET(request: Request): Promise<Response> {
  const sessionSecret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const session = cookieValue(request.headers.get("cookie"), "embe_session");
  if (!sessionSecret || !verifySessionCookie(session, sessionSecret)) {
    return Response.json({ error: "unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" }
    });
  }

  const url = new URL(request.url);
  const limit = Math.max(1, integerParam(url.searchParams.get("limit"), 24, 60));
  const offset = integerParam(url.searchParams.get("offset"), 0, 10_000);
  const memories = await getMediaMemories({ limit, offset });
  return Response.json({ memories, hasMore: memories.length === limit }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
