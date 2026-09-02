import { timingSafeEqual } from "node:crypto";

import { photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { deliverClaimedPush } from "../../../../lib/push-delivery-server";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const expected = process.env.EMBE_PUSH_CRON_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const claimed = await store.rpc("embe_claim_due_push_notifications", { p_now: new Date().toISOString(), p_limit: 20 });
  if (claimed.error || !Array.isArray(claimed.data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await deliverClaimedPush(store, claimed.data);
  return privateReply(result, 200);
}
