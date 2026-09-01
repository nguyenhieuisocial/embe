import {
  authorizeMutation, isUuidV4, PHOTO_BUCKET, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES,
  photoStore, privateReply
} from "../../../lib/photo-upload-server";

type UploadRequest = {
  authorRole: "father" | "mother";
  byteSize: number;
  caption: string;
  capturedAt: string;
  filename: string;
  idempotencyKey: string;
  latitude?: number | null;
  locationName?: string;
  longitude?: number | null;
  mimeType: string;
};

function validInput(value: unknown): value is UploadRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  const captured = typeof input.capturedAt === "string" ? new Date(input.capturedAt) : null;
  const latitude = input.latitude;
  const longitude = input.longitude;
  const coordinatesValid = (latitude == null && longitude == null) ||
    (typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
  return (
    (input.authorRole === "father" || input.authorRole === "mother") &&
    Number.isSafeInteger(input.byteSize) && Number(input.byteSize) >= 1 && Number(input.byteSize) <= PHOTO_MAX_BYTES &&
    typeof input.caption === "string" && input.caption.trim().length <= 180 &&
    Boolean(captured && !Number.isNaN(captured.getTime()) && captured.getTime() <= Date.now() + 86_400_000) &&
    typeof input.filename === "string" && input.filename.trim().length >= 1 && input.filename.trim().length <= 180 &&
    isUuidV4(input.idempotencyKey) &&
    coordinatesValid &&
    (input.locationName == null || (typeof input.locationName === "string" && input.locationName.trim().length <= 120)) &&
    typeof input.mimeType === "string" && PHOTO_MIME_TYPES.has(input.mimeType)
  );
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
    const { data, error } = await store.rpc("embe_create_photo_upload", {
      p_author_role: input.authorRole,
      p_byte_size: input.byteSize,
      p_caption: input.caption.trim(),
      p_captured_at: input.capturedAt,
      p_idempotency_key: input.idempotencyKey,
      p_latitude: input.latitude ?? null,
      p_location_name: input.locationName?.trim() ?? "",
      p_longitude: input.longitude ?? null,
      p_mime_type: input.mimeType,
      p_original_filename: input.filename.trim()
    });
    if (error || !data || typeof data !== "object") throw new Error("queue unavailable");
    const result = data as Record<string, unknown>;
    if (!isUuidV4(result.id) || typeof result.storage_path !== "string") throw new Error("invalid queue result");

    const signed = await store.storage.from(PHOTO_BUCKET).createSignedUploadUrl(result.storage_path, { upsert: false });
    if (signed.error || !signed.data?.signedUrl) throw new Error("signing unavailable");
    return privateReply({ uploadId: result.id, uploadUrl: signed.data.signedUrl }, 201);
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
