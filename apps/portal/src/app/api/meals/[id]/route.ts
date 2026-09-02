import { databaseMealAnalysis, normalizeMealAnalysis } from "../../../../lib/meal-analysis-contract";
import { deriveMealSafetyFlags } from "../../../../lib/meal-safety";
import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../lib/portal-auth";

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const { data, error } = await store.rpc("embe_get_meal_analysis", { p_id: id });
    const value = data as Record<string, unknown> | null;
    if (error || !value) return privateReply({ error: "not_found" }, 404);
    const analysis = normalizeMealAnalysis(
      value.status === "nutrition_pending" || value.status === "nutrition_processing" || value.status === "confirmed"
        ? value.confirmed_analysis : value.analysis
    );
    return privateReply({ id, status: value.status, note: value.note, ...(analysis ? { analysis } : {}) }, 200);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  let input: unknown;
  try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object") return privateReply({ error: "invalid_request" }, 400);
  const value = input as Record<string, unknown>;
  const analysis = normalizeMealAnalysis(value.analysis);
  if (!analysis || typeof value.note !== "string" || value.note.trim().length > 300
      || Object.keys(value).some((key) => !["analysis", "note"].includes(key))) {
    return privateReply({ error: "invalid_request" }, 400);
  }
  if (analysis.foods.some((food) => food.nameVi.trim().toLocaleLowerCase("vi") === "món cần mẹ xác nhận")) {
    return privateReply({ error: "invalid_request" }, 400);
  }
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const draft = await store.rpc("embe_get_meal_analysis", { p_id: id });
    const current = normalizeMealAnalysis((draft.data as Record<string, unknown> | null)?.analysis);
    if (draft.error || !current) {
      return privateReply({ error: "not_found" }, 404);
    }
    const confirmed = {
      ...current,
      foods: analysis.foods.map((food) => {
        const unchanged = current.foods.find((candidate) => candidate.searchNameEn === food.searchNameEn
          && candidate.nameVi === food.nameVi);
        if (unchanged) return { ...unchanged, estimatedGrams: food.estimatedGrams };
        const derivedSafetyFlags = deriveMealSafetyFlags(food.nameVi);
        return {
          ...food,
          searchNameEn: food.nameVi,
          confidence: 0,
          foodGroups: ["other"],
          safetyFlags: [...new Set([...derivedSafetyFlags, "unknown"])]
        };
      })
    };
    const { data, error } = await store.rpc("embe_confirm_meal_analysis", {
      p_id: id, p_confirmed_analysis: databaseMealAnalysis(confirmed), p_note: value.note.trim()
    });
    if (error || !data) throw new Error("confirmation unavailable");
    const result = data as Record<string, unknown>;
    return privateReply({ id, status: result.status === "confirmed" ? "confirmed" : "nutrition_pending" }, 202);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await store.rpc("embe_delete_meal_analysis", { p_id: id });
  return result.error ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ status: "deleted" }, 200);
}
