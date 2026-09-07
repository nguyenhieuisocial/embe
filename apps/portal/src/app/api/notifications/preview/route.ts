import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { normalizeEndpoint } from "../../../../lib/push-notification-contract";

// Endpoint credentials stay in a bounded POST body, never query strings/history.
async function execute(request: Request, write: boolean) {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  let input: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4096) throw new Error();
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) throw new Error();
    input = JSON.parse(raw);
  } catch { return privateReply({ error: "invalid_request" }, 400); }
  const endpoint = input && normalizeEndpoint(input.endpoint);
  if (!endpoint || (write && typeof input.detailPreview !== "boolean")) return privateReply({ error: "invalid_request" }, 400);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const result = await store.rpc("embe_push_preview", { p_endpoint: endpoint, p_enabled: write ? input.detailPreview : null });
  if (result.error) return privateReply({ error: "temporarily_unavailable" }, 503);
  if (!result.data || typeof result.data.detailPreview !== "boolean") return privateReply({ error: "not_found" }, 404);
  return privateReply({ detailPreview: result.data.detailPreview }, 200);
}
export const POST = (request: Request) => execute(request, false);
export const PATCH = (request: Request) => execute(request, true);
