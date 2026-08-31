import { MEAL_BUCKET } from "../../../../../lib/meal-analysis-contract";
import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../../lib/photo-upload-server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const lookup = await store.rpc("embe_get_meal_analysis", { p_id: id });
    const value = lookup.data as Record<string, unknown> | null;
    if (lookup.error || !value || typeof value.storage_path !== "string"
        || typeof value.byte_size !== "number" || typeof value.mime_type !== "string") {
      return privateReply({ error: "not_found" }, 404);
    }
    const stored = await store.storage.from(MEAL_BUCKET).info(value.storage_path);
    if (stored.error || stored.data?.size !== value.byte_size || stored.data?.contentType !== value.mime_type) {
      return privateReply({ error: "upload_mismatch" }, 409);
    }
    const completed = await store.rpc("embe_complete_meal_upload", { p_id: id });
    if (completed.error) throw new Error("completion unavailable");
    return privateReply({ status: "analyzing" }, 202);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
