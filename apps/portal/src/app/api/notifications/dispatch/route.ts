import { timingSafeEqual } from "node:crypto";

import { isUuidV4, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { pushErrorCode, sendPush, type PushMessage, type PushTarget } from "../../../../lib/push-notification-server";

export const runtime = "nodejs";

type Delivery = PushTarget & PushMessage & { id: string };

function authorized(request: Request): boolean {
  const expected = process.env.EMBE_PUSH_CRON_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function delivery(value: unknown): Delivery | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!isUuidV4(item.id) || typeof item.endpoint !== "string" || typeof item.p256dh !== "string" || typeof item.auth !== "string"
      || typeof item.title !== "string" || typeof item.body !== "string" || typeof item.url !== "string" || typeof item.tag !== "string") return null;
  return item as Delivery;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const claimed = await store.rpc("embe_claim_due_push_notifications", { p_now: new Date().toISOString(), p_limit: 20 });
  if (claimed.error || !Array.isArray(claimed.data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const deliveries = claimed.data.flatMap((value: unknown) => { const item = delivery(value); return item ? [item] : []; });
  let sent = 0; let failed = 0;
  for (const item of deliveries) {
    try {
      await sendPush(item, { title: item.title, body: item.body, url: item.url, tag: item.tag });
      await store.rpc("embe_complete_push_delivery", { p_id: item.id, p_sent: true, p_error_code: null });
      sent += 1;
    } catch (error) {
      const errorCode = pushErrorCode(error);
      await store.rpc("embe_complete_push_delivery", { p_id: item.id, p_sent: false, p_error_code: errorCode });
      if (errorCode === "http_404" || errorCode === "http_410") await store.rpc("embe_disable_push_subscription", { p_endpoint: item.endpoint });
      failed += 1;
    }
  }
  return privateReply({ claimed: deliveries.length, sent, failed }, 200);
}
