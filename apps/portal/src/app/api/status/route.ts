import { authorizeMutation, photoStore, privateReply } from "../../../lib/photo-upload-server";
import { getTimelineFreshness } from "../../../lib/timeline";

type ServiceState = "ready" | "limited" | "paused" | "setup";

function heartbeatState(value: unknown, now = Date.now()): ServiceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "paused";
  const heartbeat = value as Record<string, unknown>;
  if (typeof heartbeat.last_seen_at !== "string") return "paused";
  const lastSeenAt = new Date(heartbeat.last_seen_at).getTime();
  if (!Number.isFinite(lastSeenAt) || lastSeenAt > now + 60_000 || now - lastSeenAt > 5 * 60_000) return "paused";
  if (heartbeat.state === "degraded") return "limited";
  return heartbeat.state === "online" ? "ready" : "paused";
}

function photosState(): ServiceState {
  try {
    const url = new URL(process.env.EMBE_PHOTO_SERVER_URL ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? "ready" : "setup";
  } catch {
    return "setup";
  }
}

export async function GET(request: Request): Promise<Response> {
  const authorization = authorizeMutation(new Request(request.url, {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "", origin: new URL(request.url).origin }
  }));
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);

  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const [family, food, assistant, journal] = await Promise.all([
    store.rpc("embe_push_family_status", {}),
    store.rpc("embe_get_worker_heartbeat", { p_worker_name: "meal-analysis" }),
    store.rpc("embe_get_worker_heartbeat", { p_worker_name: "assistant" }),
    getTimelineFreshness()
  ]);
  const familyData = !family.error && family.data && typeof family.data === "object" && !Array.isArray(family.data)
    ? family.data as Record<string, unknown>
    : null;
  const mother = typeof familyData?.mother === "number" ? familyData.mother : 0;
  const father = typeof familyData?.father === "number" ? familyData.father : 0;
  const generic = typeof familyData?.family === "number" ? familyData.family : 0;

  return privateReply({
    services: {
      data: familyData ? "ready" : "limited",
      journal: journal === "fresh" ? "ready" : journal === "stale" ? "limited" : "paused",
      food: food.error ? "paused" : heartbeatState(food.data),
      assistant: assistant.error ? "paused" : heartbeatState(assistant.data),
      notifications: mother + father + generic > 0 ? "ready" : "setup",
      photos: photosState()
    },
    notificationRoles: { mother: mother > 0, father: father > 0 },
    checkedAt: new Date().toISOString()
  }, 200);
}
