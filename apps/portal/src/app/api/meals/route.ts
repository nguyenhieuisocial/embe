import {
  isUuidV4, photoStore, authorizeMutation, privateReply
} from "../../../lib/photo-upload-server";
import {
  MEAL_BUCKET, MEAL_MAX_BYTES, MEAL_MIME_TYPES, MEAL_TYPES, normalizeMealAnalysis
} from "../../../lib/meal-analysis-contract";
import { verifySessionCookie } from "../../../lib/portal-auth";

type MealRequest = {
  authorRole: "father" | "mother";
  eatenAt: string;
  idempotencyKey: string;
  mealType: string;
  note: string;
  byteSize?: number;
  filename?: string;
  mimeType?: string;
};

function cookieValue(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie")), secret));
}

function validInput(value: unknown): value is MealRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  const eatenAt = typeof input.eatenAt === "string" ? new Date(input.eatenAt) : null;
  const baseIsValid = (
    (input.authorRole === "father" || input.authorRole === "mother")
    && Boolean(eatenAt && !Number.isNaN(eatenAt.getTime()) && eatenAt.getTime() <= Date.now() + 86_400_000)
    && isUuidV4(input.idempotencyKey)
    && typeof input.mealType === "string" && MEAL_TYPES.has(input.mealType)
    && typeof input.note === "string" && input.note.trim().length <= 300
    && Object.keys(input).every((key) => ["authorRole", "byteSize", "eatenAt", "filename", "idempotencyKey", "mealType", "mimeType", "note"].includes(key))
  );
  if (!baseIsValid) return false;
  const hasAnyPhotoField = [input.byteSize, input.filename, input.mimeType].some((field) => field !== undefined);
  if (!hasAnyPhotoField) return (input.note as string).trim().length >= 1;
  return Number.isSafeInteger(input.byteSize) && Number(input.byteSize) >= 1 && Number(input.byteSize) <= MEAL_MAX_BYTES
    && typeof input.filename === "string" && input.filename.trim().length >= 1 && input.filename.trim().length <= 180
    && typeof input.mimeType === "string" && MEAL_MIME_TYPES.has(input.mimeType);
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let input: unknown;
  try { input = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  if (!validInput(input)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    if (input.byteSize === undefined) {
      const { data, error } = await store.rpc("embe_create_meal_note", {
        p_idempotency_key: input.idempotencyKey, p_author_role: input.authorRole,
        p_meal_type: input.mealType, p_eaten_at: input.eatenAt, p_note: input.note.trim()
      });
      const result = data as Record<string, unknown> | null;
      if (error || !result || !isUuidV4(result.id)) throw new Error("meal note unavailable");
      return privateReply({ entryId: result.id, status: "analyzing" }, 201);
    }
    const { data, error } = await store.rpc("embe_create_meal_analysis", {
      p_idempotency_key: input.idempotencyKey, p_author_role: input.authorRole,
      p_meal_type: input.mealType, p_eaten_at: input.eatenAt, p_note: input.note.trim(),
      p_original_filename: input.filename!.trim(), p_mime_type: input.mimeType!, p_byte_size: input.byteSize
    });
    const result = data as Record<string, unknown> | null;
    if (error || !result || !isUuidV4(result.id) || typeof result.storage_path !== "string") throw new Error("queue unavailable");
    const signed = await store.storage.from(MEAL_BUCKET).createSignedUploadUrl(result.storage_path, { upsert: false });
    if (signed.error || !signed.data?.signedUrl) throw new Error("signing unavailable");
    return privateReply({ entryId: result.id, uploadUrl: signed.data.signedUrl }, 201);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}

type HistoryEntry = {
  id: string;
  mealType: string;
  eatenAt: string;
  note: string;
  status: "ready" | "processing" | "analyzing" | "needs_review" | "failed";
  analysis: NonNullable<ReturnType<typeof normalizeMealAnalysis>>;
};
type WorkerStatus = { status: "online" | "degraded" | "offline" | "unknown"; lastSeenAt?: string };

function workerStatus(value: unknown): WorkerStatus {
  if (!value || typeof value !== "object") return { status: "unknown" };
  const heartbeat = value as Record<string, unknown>;
  if (typeof heartbeat.last_seen_at !== "string") return { status: "unknown" };
  const lastSeen = new Date(heartbeat.last_seen_at);
  if (Number.isNaN(lastSeen.getTime())) return { status: "unknown" };
  if (Date.now() - lastSeen.getTime() > 5 * 60_000) return { status: "offline", lastSeenAt: heartbeat.last_seen_at };
  return {
    status: heartbeat.state === "degraded" ? "degraded" : heartbeat.state === "online" ? "online" : "unknown",
    lastSeenAt: heartbeat.last_seen_at
  };
}

function suggestions(entries: HistoryEntry[]): string[] {
  if (entries.length < 3) return ["Ghi ít nhất 3 bữa để EmBe bắt đầu nhìn xu hướng; bữa chưa ghi không được xem là đã bỏ ăn."];
  const groups = new Set(entries.flatMap((entry) => entry.analysis?.foods.flatMap((food) => food.foodGroups) ?? []));
  const result: string[] = [];
  if (!groups.has("vegetables")) result.push("Các bữa đã ghi chưa thấy rau; nếu phù hợp, bữa tới thêm một phần rau đã rửa sạch và nấu chín.");
  if (!groups.has("protein")) result.push("Các bữa đã ghi chưa thấy nguồn đạm rõ; cân nhắc trứng chín kỹ, đậu, thịt hoặc cá phù hợp với hướng dẫn đang theo.");
  if (!groups.has("fruit")) result.push("Lịch sử chưa thấy trái cây; có thể thêm một phần đã rửa sạch nếu bác sĩ không dặn hạn chế.");
  if (!groups.has("dairy")) result.push("Lịch sử chưa thấy sữa hoặc chế phẩm sữa; chỉ chọn loại tiệt trùng và phù hợp với cơ thể.");
  return result.slice(0, 2).length ? result.slice(0, 2) : ["Các nhóm thực phẩm trong những bữa đã ghi khá đa dạng. Tiếp tục xác nhận đúng món và khẩu phần."];
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const days = Number(new URL(request.url).searchParams.get("days") ?? "7");
  if (!Number.isInteger(days) || ![7, 14, 28, 30].includes(days)) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  try {
    const { data, error } = await store.rpc("embe_list_meal_history", { p_days: days });
    if (error || !Array.isArray(data)) throw new Error("history unavailable");
    const history: HistoryEntry[] = data.flatMap((row: unknown) => {
      if (!row || typeof row !== "object") return [];
      const value = row as Record<string, unknown>;
      const analysis = normalizeMealAnalysis(value.analysis);
      if (!isUuidV4(value.id) || typeof value.meal_type !== "string" || !MEAL_TYPES.has(value.meal_type)
          || typeof value.eaten_at !== "string" || typeof value.note !== "string" || !analysis) return [];
      const status = value.status === "nutrition_pending" || value.status === "nutrition_processing"
        ? "processing" : value.status === "uploaded" || value.status === "analyzing"
          ? "analyzing" : value.status === "review" ? "needs_review"
            : value.status === "failed" || value.status === "rejected" ? "failed" : "ready";
      return [{ id: value.id, mealType: value.meal_type, eatenAt: value.eaten_at, note: value.note, status, analysis }];
    });
    const heartbeat = await store.rpc("embe_get_worker_heartbeat", { p_worker_name: "meal-analysis" });
    return privateReply({
      history,
      suggestions: suggestions(history.filter((entry) => entry.status === "ready" || entry.status === "processing")),
      worker: workerStatus(heartbeat.error ? null : heartbeat.data),
      notice: "Chỉ dựa trên bữa đã ghi; không chẩn đoán thiếu chất."
    }, 200);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
