import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../../lib/photo-upload-server";
import { MEDICAL_BUCKET, MEDICAL_MIME_TYPES } from "../../../../../lib/pregnancy-medical";
import { verifySessionCookie } from "../../../../../lib/portal-auth";

type Context = { params: Promise<{ id: string }> };
function session(request: Request): boolean {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
  return Boolean(process.env.EMBE_PORTAL_SESSION_SECRET && verifySessionCookie(cookie, process.env.EMBE_PORTAL_SESSION_SECRET));
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params; if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const query = await store.rpc("embe_get_pregnancy_medical_document", { p_id: id });
    const item = query.data as Record<string, unknown> | null;
    if (query.error || !item || typeof item.storage_path !== "string") return privateReply({ error: "not_found" }, 404);
    if (item.status === "ready") return privateReply({ status: "ready" }, 200);
    if (item.status !== "pending") return privateReply({ error: "not_found" }, 404);
    const object = await store.storage.from(MEDICAL_BUCKET).info(item.storage_path);
    const contentType = object.data?.contentType?.split(";", 1)[0].toLowerCase();
    if (object.error || !object.data || object.data.size !== item.byte_size || contentType !== item.mime_type
        || !contentType || !MEDICAL_MIME_TYPES.has(contentType)) return privateReply({ error: "upload_mismatch" }, 409);
    const completed = await store.rpc("embe_complete_pregnancy_medical_document", { p_id: id });
    if (completed.error) throw new Error("complete unavailable");
    return privateReply({ status: "ready" }, 202);
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  if (!session(request)) return privateReply({ error: "unauthorized" }, 401);
  const { id } = await context.params; if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const query = await store.rpc("embe_get_pregnancy_medical_document", { p_id: id });
    const item = query.data as Record<string, unknown> | null;
    if (query.error || !item || item.status !== "ready" || typeof item.storage_path !== "string" || typeof item.mime_type !== "string") return privateReply({ error: "not_found" }, 404);
    const downloaded = await store.storage.from(MEDICAL_BUCKET).download(item.storage_path);
    if (downloaded.error || !downloaded.data) throw new Error("download unavailable");
    return new Response(downloaded.data, { status: 200, headers: {
      "content-type": item.mime_type, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(item.original_filename ?? "tai-lieu"))}`,
      "cache-control": "private, no-store", "x-content-type-options": "nosniff"
    } });
  } catch { return privateReply({ error: "temporarily_unavailable" }, 503); }
}
