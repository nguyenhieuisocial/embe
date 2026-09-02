import { normalizeFamilyActivityReport } from "../../../../lib/family-activity-notification";
import { authorizeMutation, isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { deliverClaimedPush } from "../../../../lib/push-delivery-server";

export const runtime = "nodejs";

async function body(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 4096) return null;
  try {
    const raw = await request.text();
    return new TextEncoder().encode(raw).byteLength <= 4096 ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const input = normalizeFamilyActivityReport(await body(request));
  if (!input) return privateReply({ error: "invalid_request" }, 400);
  if (!input.kind) return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });

  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const recorded = await store.rpc("embe_record_family_activity", {
    p_event_id: input.eventId,
    p_source_device_id: input.sourceDeviceId,
    p_activity_kind: input.kind
  });
  if (recorded.error) return privateReply({ error: "temporarily_unavailable" }, 503);
  const queued = await store.rpc("embe_enqueue_family_activity", {
    p_event_id: input.eventId,
    p_source_endpoint: input.sourceEndpoint,
    p_activity_kind: input.kind
  });
  if (queued.error) return privateReply({ error: "temporarily_unavailable" }, 503);
  const claimed = await store.rpc("embe_claim_family_activity", { p_event_id: input.eventId, p_limit: 20 });
  if (claimed.error) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await deliverClaimedPush(store, claimed.data);
  return privateReply({ queued: typeof queued.data === "number" ? queued.data : 0, sent: result.sent, failed: result.failed }, 200);
}

export async function GET(request: Request): Promise<Response> {
  const authorization = authorizeMutation(new Request(request.url, {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "", origin: new URL(request.url).origin }
  }));
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId");
  const after = url.searchParams.get("after");
  const parsedAfter = after ? new Date(after) : null;
  if (!isUuidV4(deviceId) || !parsedAfter || Number.isNaN(parsedAfter.getTime())
      || Date.now() - parsedAfter.getTime() > 7 * 86_400_000
      || parsedAfter.getTime() > Date.now() + 60_000) {
    return privateReply({ error: "invalid_request" }, 400);
  }
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const value = await store.rpc("embe_list_family_activity", {
    p_device_id: deviceId, p_after: parsedAfter.toISOString(), p_limit: 10
  });
  if (value.error || !Array.isArray(value.data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const activities = value.data.flatMap((row: Record<string, unknown>) =>
    isUuidV4(row.event_id) && typeof row.activity_kind === "string"
      && typeof row.title === "string" && typeof row.target_url === "string"
      && typeof row.created_at === "string"
      ? [{ id: row.event_id, kind: row.activity_kind, title: row.title, url: row.target_url, createdAt: row.created_at }]
      : []);
  return privateReply({ activities }, 200);
}
