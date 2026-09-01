import { getMediaLocator } from "../../../../lib/media";
import { storedMediaResponse } from "../../../../lib/media-response";
import { verifySessionCookie } from "../../../../lib/portal-auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const sessionSecret = process.env.EMBE_PORTAL_SESSION_SECRET;
  const session = cookieValue(request.headers.get("cookie"), "embe_session");
  if (!sessionSecret || !verifySessionCookie(session, sessionSecret)) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const { id } = await context.params;
  const locator = await getMediaLocator(id);
  return locator ? storedMediaResponse(locator, "private, max-age=300") : new Response("Not found", { status: 404 });
}
