import { MEAL_BUCKET, MEAL_MIME_TYPES } from "../../../../../lib/meal-analysis-contract";
import { isUuidV4, photoStore, privateReply } from "../../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../../lib/portal-auth";

type Context = { params: Promise<{ id: string }> };

function hasSession(request: Request): boolean {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  return Boolean(process.env.EMBE_PORTAL_SESSION_SECRET
    && verifySessionCookie(cookie, process.env.EMBE_PORTAL_SESSION_SECRET));
}

export async function GET(request: Request, context: Context): Promise<Response> {
  if (!hasSession(request)) return privateReply({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const query = await store.rpc("embe_get_meal_analysis", { p_id: id });
    if (query.error) return privateReply({ error: "temporarily_unavailable" }, 503, { "retry-after": "3" });
    const item = query.data as Record<string, unknown> | null;
    const mimeType = typeof item?.mime_type === "string" ? item.mime_type.split(";", 1)[0].toLowerCase() : "";
    if (!item || item.status === "deleted" || typeof item.storage_path !== "string"
        || !MEAL_MIME_TYPES.has(mimeType)) return privateReply({ error: "not_found" }, 404);
    // Keep the bucket private. Vercel authorizes access; Storage serves bytes
    // directly, without relying on the local AI worker or buffering the photo.
    const signed = await store.storage.from(MEAL_BUCKET).createSignedUrl(item.storage_path, 300);
    if (signed.error || !signed.data?.signedUrl) {
      return privateReply({ error: "temporarily_unavailable" }, 503, { "retry-after": "3" });
    }
    const url = new URL(signed.data.signedUrl);
    if (url.protocol !== 'https:' || url.origin !== new URL(process.env.SUPABASE_URL!).origin
        || url.username || url.password || !url.pathname.startsWith(`/storage/v1/object/sign/${MEAL_BUCKET}/`)) {
      return privateReply({ error: "temporarily_unavailable" }, 503);
    }
    return new Response(null, { status: 302, headers: {
      "location": url.href,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "vary": "Cookie"
    } });
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
