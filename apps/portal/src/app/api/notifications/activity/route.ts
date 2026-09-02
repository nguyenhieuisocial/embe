import { normalizeFamilyActivityReport } from "../../../../lib/family-activity-notification";
import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";
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

