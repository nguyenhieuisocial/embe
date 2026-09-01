import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { normalizeEndpoint, normalizePushSubscription } from "../../../../lib/push-notification-contract";
import { pushErrorCode, sendPush } from "../../../../lib/push-notification-server";

export const runtime = "nodejs";

async function body(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 8192) return null;
  try {
    const raw = await request.text();
    return new TextEncoder().encode(raw).byteLength <= 8192 ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const input = normalizePushSubscription(await body(request));
  if (!input) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const saved = await store.rpc("embe_upsert_push_subscription", {
    p_endpoint: input.endpoint, p_p256dh: input.p256dh, p_auth: input.auth,
    p_device_role: input.deviceRole, p_timezone: input.timezone
  });
  if (saved.error) return privateReply({ error: "temporarily_unavailable" }, 503);
  let testSent = true;
  try {
    await sendPush(input, { title: "Đã bật thông báo", body: "EmBe sẽ nhắc nhẹ những việc quan trọng của nhà mình.", url: "/nha-minh", tag: "embe-welcome" });
  } catch (error) { testSent = false; void pushErrorCode(error); }
  return privateReply({ ok: true, testSent }, 201);
}

export async function DELETE(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const input = await body(request);
  const endpoint = input && typeof input === "object" ? normalizeEndpoint((input as Record<string, unknown>).endpoint) : null;
  if (!endpoint) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await store.rpc("embe_disable_push_subscription", { p_endpoint: endpoint });
  return result.error ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ ok: true }, 200);
}
