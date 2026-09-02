import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";

const MAX_EXPORT_BYTES = 4 * 1024 * 1024;
const FORBIDDEN_KEYS = /(?:^|_)(?:api_key|authorization|binary|checksum|connection_string|cookie|idempotency_key|object_path|password|private_key|secret|storage_path|token|token_hash)(?:$|_)/i;

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.test(key) || containsForbiddenKey(child));
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const { data, error } = await store.rpc("embe_export_family_data_v2");
  if (error || !data || typeof data !== "object" || containsForbiddenKey(data)) {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
  const body = JSON.stringify(data);
  if (new TextEncoder().encode(body).byteLength > MAX_EXPORT_BYTES) {
    return privateReply({ error: "export_too_large" }, 413);
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="embe-family-data-${day}.json"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff"
    }
  });
}
