import { getMediaMemories } from "../../../lib/media";
import { dayRange } from "../../../lib/calendar";
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
  const date = url.searchParams.get("date");
  const album = url.searchParams.get("album");
  const range = date ? dayRange(date) : null;
  if (date && !range) {
    return Response.json({ error: "invalid_date" }, {
      status: 400,
      headers: { "Cache-Control": "private, no-store" }
    });
  }
  if (album && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(album) || album.length > 64)) {
    return Response.json({ error: "invalid_album" }, {
      status: 400,
      headers: { "Cache-Control": "private, no-store" }
    });
  }
  const memories = await getMediaMemories({ ...(album ? { album } : {}), limit, offset, ...range });
  return Response.json({ memories, hasMore: memories.length === limit }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
