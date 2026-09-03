import { MEAL_BUCKET } from "../../../../../lib/meal-analysis-contract";
import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../../lib/photo-upload-server";
import { revalidateFamilyViews } from "../../../../../lib/family-view-revalidation";

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
    const result = completed.data as Record<string, unknown> | null;
    const checklistCompletion = typeof result?.checklist_task_id === "string"
      && typeof result.checklist_day === "string"
      ? { taskId: result.checklist_task_id, day: result.checklist_day }
      : null;
    revalidateFamilyViews();
    return privateReply({
      status: "analyzing", ...(checklistCompletion ? { checklistCompletion } : {})
    }, 202, { "x-embe-activity-ready": "1" });
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
