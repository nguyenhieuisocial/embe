import { getMediaLocator } from "../../../../../lib/media";
import { storedMediaResponse } from "../../../../../lib/media-response";
import { verifyMediaShareToken } from "../../../../../lib/share-token";

export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { token } = await context.params;
  const shared = verifyMediaShareToken(token);
  if (!shared) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const locator = await getMediaLocator(shared.id);
  return locator
    ? storedMediaResponse(locator, "private, max-age=300")
    : new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
