import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: "invalid_request" }, 400);
  let value: Record<string, unknown>;
  try { value = await request.json(); } catch { return privateReply({ error: "invalid_request" }, 400); }
  const captured = typeof value.capturedAt === "string" ? new Date(value.capturedAt) : null;
  const latitude = value.latitude;
  const longitude = value.longitude;
  const keepCoordinates = latitude === undefined && longitude === undefined;
  const coordinatesValid = (latitude == null && longitude == null) ||
    (typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
  if (!captured || Number.isNaN(captured.getTime()) || captured.getTime() < Date.parse("2000-01-01T00:00:00Z") ||
      captured.getTime() > Date.now() + 86_400_000 || typeof value.locationName !== "string" ||
      value.locationName.trim().length > 120 || !coordinatesValid) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_update_uploaded_media_metadata", {
    p_captured_at: captured.toISOString(), p_latitude: latitude ?? null,
    p_keep_coordinates: keepCoordinates, p_location_name: value.locationName.trim(),
    p_longitude: longitude ?? null, p_media_item_id: id
  });
  if (error || !data || typeof data !== "object") return privateReply({ error: "not_editable" }, 409);
  const result = data as Record<string, unknown>;
  return privateReply({ eventAt: result.event_at, placeCity: result.place_city ?? null }, 200);
}
