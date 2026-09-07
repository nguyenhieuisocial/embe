import { getMediaMemories } from "../../../lib/media";
import { dayRange } from "../../../lib/calendar";
import { verifySessionCookie } from "../../../lib/portal-auth";
import { memberAuthorization } from "../../../lib/family-members-server";
import { UUID } from "../../../lib/family-members";
import { privateReply } from "../../../lib/photo-upload-server";

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
  if (url.searchParams.has("ids")) {
    const denied = await memberAuthorization(request); if (denied) return denied;
    const ids = url.searchParams.get("ids")!.split(",");
    if (!ids.length || ids.length > 12 || new Set(ids).size !== ids.length || ids.some(id => !UUID.test(id))) return privateReply({ error: "invalid_request" }, 400);
    try { return privateReply({ memories: await getMediaMemories({ ids, limit: 12, strict: true }), hasMore: false }, 200); }
    catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
  }
  const limit = Math.max(1, integerParam(url.searchParams.get("limit"), 24, 60));
  const offsetText = url.searchParams.get("offset");
  if (offsetText !== null && (!/^\d+$/.test(offsetText) || Number(offsetText) > 1_000_000)) return privateReply({ error: "invalid_offset" }, 400);
  const offset = integerParam(offsetText, 0, 1_000_000);
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
  try {
    const memories = await getMediaMemories({ ...(album ? { album } : {}), limit, offset, ...range, strict: true });
    return privateReply({ memories, hasMore: memories.length === limit }, 200);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
