import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { normalizeEndpoint, normalizePushSchedule, normalizePushSubscription } from "../../../../lib/push-notification-contract";
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

export async function GET(request: Request): Promise<Response> {
  const authorization = authorizeMutation(new Request(request.url, {
    method: "POST", headers: { cookie: request.headers.get("cookie") ?? "", origin: new URL(request.url).origin }
  }));
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await store.rpc("embe_push_family_status", {});
  if (result.error || !result.data || typeof result.data !== "object") return privateReply({ error: "temporarily_unavailable" }, 503);
  const value = result.data as Record<string, unknown>;
  const mother = typeof value.mother === "number" ? value.mother : 0;
  const father = typeof value.father === "number" ? value.father : 0;
  const family = typeof value.family === "number" ? value.family : 0;
  return privateReply({ roles: { mother: mother > 0, father: father > 0 }, enabledDevices: mother + father + family }, 200);
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
    p_device_role: input.deviceRole, p_timezone: input.timezone, p_notify_at: input.notifyAt
  });
  if (saved.error) return privateReply({ error: "temporarily_unavailable" }, 503);
  let testSent = true;
  try {
    await sendPush(input, { title: "Đã bật thông báo", body: "EmBe sẽ nhắc nhẹ những việc quan trọng của nhà mình.", url: "/nha-minh", tag: "embe-welcome" });
  } catch (error) { testSent = false; void pushErrorCode(error); }
  return privateReply({ ok: true, testSent }, 201);
}

export async function PATCH(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const input = normalizePushSchedule(await body(request));
  if (!input) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await store.rpc("embe_update_push_schedule", { p_endpoint: input.endpoint, p_notify_at: input.notifyAt });
  return result.error ? privateReply({ error: "temporarily_unavailable" }, 503) : privateReply({ ok: true }, 200);
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
