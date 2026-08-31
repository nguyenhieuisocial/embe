import {
  authorizeMutation, isUuidV4, PHOTO_BUCKET, PHOTO_MIME_TYPES, photoStore, privateReply
} from "../../../../../lib/photo-upload-server";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);

  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);

  try {
    const query = await store.rpc("embe_get_photo_upload", { p_upload_id: id });
    const item = query.data as Record<string, unknown> | null;
    if (query.error || !item || typeof item.storage_path !== "string") return privateReply({ error: "not_found" }, 404);
    if (item.status !== "awaiting_upload" && item.status !== "uploaded") return privateReply({ error: "invalid_state" }, 409);

    const object = await store.storage.from(PHOTO_BUCKET).info(item.storage_path);
    const contentType = object.data?.contentType?.split(";", 1)[0].toLowerCase();
    if (
      object.error || !object.data || object.data.size !== item.byte_size ||
      !contentType || contentType !== item.mime_type || !PHOTO_MIME_TYPES.has(contentType)
    ) return privateReply({ error: "upload_mismatch" }, 409);

    const completed = await store.rpc("embe_complete_photo_upload", { p_upload_id: id });
    if (completed.error) throw new Error("queue unavailable");
    return privateReply({ status: "accepted" }, 202);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
