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
    const item = query.data as Record<string, unknown> | null;
    const mimeType = typeof item?.mime_type === "string" ? item.mime_type.split(";", 1)[0].toLowerCase() : "";
    if (query.error || !item || item.status === "deleted" || typeof item.storage_path !== "string"
        || !MEAL_MIME_TYPES.has(mimeType)) return privateReply({ error: "not_found" }, 404);
    const downloaded = await store.storage.from(MEAL_BUCKET).download(item.storage_path);
    if (downloaded.error || !downloaded.data) return privateReply({ error: "not_found" }, 404);
    return new Response(await downloaded.data.arrayBuffer(), { status: 200, headers: {
      "content-type": mimeType,
      "content-disposition": "inline; filename*=UTF-8''bua-an.jpg",
      "cache-control": "private, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff"
    } });
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
