import type { MediaLocator } from "./media";

export async function storedMediaResponse(locator: MediaLocator, cacheControl: string): Promise<Response> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return new Response("Not found", { status: 404 });

  try {
    const encodedPath = locator.objectPath.split("/").map(encodeURIComponent).join("/");
    const upstream = await fetch(
      `${new URL(baseUrl).origin}/storage/v1/object/authenticated/embe-portal-previews/${encodedPath}`,
      {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` }
      }
    );
    const contentType = (upstream.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase();
    const contentLength = Number(upstream.headers.get("content-length") ?? "0");
    if (!upstream.ok || !upstream.body || contentType !== locator.mimeType || contentLength > 10_000_000) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": cacheControl,
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "ETag": `\"sha256-${locator.checksum}\"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Media temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
