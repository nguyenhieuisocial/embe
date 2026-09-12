import { authorizeMutation, photoStore, privateReply } from "../../../lib/photo-upload-server";

type ServiceState = "ready" | "limited" | "paused" | "setup";

function heartbeatState(value: unknown, now = Date.now(), maxAge = 5 * 60_000): ServiceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "paused";
  const heartbeat = value as Record<string, unknown>;
  if (typeof heartbeat.last_seen_at !== "string") return "paused";
  const lastSeenAt = new Date(heartbeat.last_seen_at).getTime();
  if (!Number.isFinite(lastSeenAt) || lastSeenAt > now + 60_000 || now - lastSeenAt > maxAge) return "paused";
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

function reminderSchedulerReady(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = value as Record<string, unknown>;
  const lastSuccess = typeof status.last_success_at === "string" ? Date.parse(status.last_success_at) : NaN;
  return status.http_status === 200 && Number.isFinite(lastSuccess)
    && lastSuccess <= now + 60_000 && now - lastSuccess <= 6 * 60_000;
}

function archiveState(value: unknown, now = Date.now()): ServiceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "paused";
  const archive = value as Record<string, unknown>;
  const scanned = typeof archive.scanned_at === "string" ? Date.parse(archive.scanned_at) : NaN;
  if (!Number.isFinite(scanned) || scanned > now + 60_000 || now - scanned > 30 * 60_000) return "paused";
  if (typeof archive.total !== "number" || typeof archive.saved !== "number" || typeof archive.pending !== "number"
    || archive.total < 0 || archive.saved < 0 || archive.pending < 0 || archive.saved + archive.pending !== archive.total) return "paused";
  return archive.pending === 0 ? "ready" : "limited";
}

export async function GET(request: Request): Promise<Response> {
  const authorization = authorizeMutation(new Request(request.url, {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "", origin: new URL(request.url).origin }
  }));
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);

  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const [family, food, assistant, journal, reminders, backup, fileArchive] = await Promise.all([
    store.rpc("embe_push_family_status", {}),
    store.rpc("embe_get_worker_heartbeat", { p_worker_name: "meal-analysis" }),
    store.rpc("embe_get_worker_heartbeat", { p_worker_name: "assistant" }),
    // Cloud journals do not wait for the legacy Memos worker. Probe the private
    // timeline without retrieving family text or treating an empty list as down.
    store.from("embe_timeline_event").select("id", { head: true }).limit(1)
      .abortSignal(AbortSignal.timeout(5000)),
    store.rpc("embe_cloud_reminder_status", {}),
    store.rpc("embe_get_worker_heartbeat", { p_worker_name: "cloud-db-backup" }),
    store.rpc("embe_file_archive_status", {})
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
      journal: journal.error ? "paused" : "ready",
      food: food.error ? "paused" : heartbeatState(food.data),
      assistant: assistant.error ? "paused" : heartbeatState(assistant.data),
      notifications: mother + father + generic > 0
        ? !reminders.error && reminderSchedulerReady(reminders.data) ? "ready" : "limited"
        : "setup",
      photos: photosState(),
      backup: backup.error ? "paused" : heartbeatState(backup.data, Date.now(), 36 * 60 * 60_000),
      fileArchive: fileArchive.error ? "paused" : archiveState(fileArchive.data)
    },
    notificationRoles: { mother: mother > 0, father: father > 0 },
    checkedAt: new Date().toISOString()
  }, 200);
}
