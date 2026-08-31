import { isAllowedMediaUrl } from "../../../../lib/media";
import { getTimeline } from "../../../../lib/timeline";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const event = (await getTimeline()).find((item) => item.id === id);
  const mediaUrl = event?.albumCoverUrl;
  const allowedHosts = process.env.MEDIA_COVER_HOSTS ?? "";
  if (!mediaUrl || !isAllowedMediaUrl(mediaUrl, allowedHosts)) return new Response("Not found", { status: 404 });

  try {
    const upstream = await fetch(mediaUrl, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const contentType = upstream.headers.get("content-type") ?? "";
    const contentLength = Number(upstream.headers.get("content-length") ?? "0");
    if (!upstream.ok || !upstream.body || !contentType.startsWith("image/") || contentLength > 10_000_000) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Media temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
