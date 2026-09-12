import { createHash, timingSafeEqual } from "node:crypto";

import { photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { deliverClaimedPush } from "../../../../lib/push-delivery-server";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const expected = process.env.EMBE_PUSH_CRON_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function POST(request: Request): Promise<Response> {
  const legacyAuthorized = authorized(request);
  const cloudToken = /^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!legacyAuthorized && !cloudToken) return privateReply({ error: "unauthorized" }, 401);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  if (!legacyAuthorized) {
    const checked = await store.rpc("embe_verify_cloud_reminder", {
      p_token_hash: createHash("sha256").update(cloudToken!).digest("hex")
    });
    if (checked.error || checked.data !== true) return privateReply({ error: "unauthorized" }, 401);
  }
  const claimed = await store.rpc("embe_claim_due_push_notifications", { p_now: new Date().toISOString(), p_limit: 20 });
  if (claimed.error || !Array.isArray(claimed.data)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await deliverClaimedPush(store, claimed.data);
  return privateReply(result, 200);
}
