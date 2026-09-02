import type { photoStore } from "./photo-upload-server";
import { isUuidV4 } from "./photo-upload-server";
import { pushErrorCode, sendPush, type PushMessage, type PushTarget } from "./push-notification-server";

type Store = NonNullable<ReturnType<typeof photoStore>>;
type Delivery = PushTarget & PushMessage & { id: string };

function delivery(value: unknown): Delivery | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!isUuidV4(item.id) || typeof item.endpoint !== "string" || typeof item.p256dh !== "string" || typeof item.auth !== "string"
      || typeof item.title !== "string" || typeof item.body !== "string" || typeof item.url !== "string" || typeof item.tag !== "string") return null;
  return item as Delivery;
}

export async function deliverClaimedPush(store: Store, value: unknown): Promise<{ claimed: number; sent: number; failed: number }> {
  const deliveries = Array.isArray(value) ? value.flatMap((item) => { const parsed = delivery(item); return parsed ? [parsed] : []; }) : [];
  let sent = 0;
  let failed = 0;
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
  return { claimed: deliveries.length, sent, failed };
}

