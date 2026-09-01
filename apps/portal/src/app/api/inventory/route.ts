import { verifySessionCookie } from "../../../lib/portal-auth";
import { authorizeMutation } from "../../../lib/photo-upload-server";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNITS = new Set(["cái", "gói", "hộp", "ml", "g"]);
const CATEGORIES = new Set(["baby", "nutrition", "mother", "other"]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

type Item = {
  productId: number;
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  needsRestock: boolean;
};

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(cookieValue(request.headers.get("cookie"), "embe_session"), secret));
}

function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function configuration(): { baseUrl: string; secretKey: string } | null {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  return baseUrl?.startsWith("https://") && secretKey ? { baseUrl: baseUrl.replace(/\/$/, ""), secretKey } : null;
}

async function rpc(config: { baseUrl: string; secretKey: string }, name: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${config.baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: config.secretKey,
      authorization: `Bearer ${config.secretKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function normalizeItems(value: unknown): Item[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const items: Item[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (
      !Number.isInteger(item.source_product_id) || !finiteNumber(item.source_product_id, 1, 2_147_483_647) ||
      typeof item.name !== "string" || item.name.length < 1 || item.name.length > 80 ||
      typeof item.unit !== "string" || !UNITS.has(item.unit) ||
      !finiteNumber(item.quantity, 0, 100_000) || !finiteNumber(item.min_quantity, 0, 100_000) ||
      typeof item.needs_restock !== "boolean"
    ) return null;
    items.push({
      productId: item.source_product_id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      minQuantity: item.min_quantity,
      needsRestock: item.needs_restock
    });
  }
  return items;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const config = configuration();
  if (!config) return reply({ error: "temporarily_unavailable" }, 503);
  try {
    const query = new URLSearchParams({
      select: "source_product_id,name,quantity,unit,min_quantity,needs_restock",
      order: "needs_restock.desc,name.asc",
      limit: "500"
    });
    const [itemsResponse, queueResponse] = await Promise.all([
      fetch(`${config.baseUrl}/rest/v1/embe_inventory_item?${query}`, {
        cache: "no-store",
        headers: { Accept: "application/json", apikey: config.secretKey },
        signal: AbortSignal.timeout(8000)
      }),
      rpc(config, "embe_inventory_queue_status", {})
    ]);
    if (!itemsResponse.ok || !queueResponse.ok) return reply({ error: "temporarily_unavailable" }, 503);
    const items = normalizeItems(await itemsResponse.json());
    const queue = await queueResponse.json() as Record<string, unknown>;
    const pending = Number(queue.pending ?? 0) + Number(queue.processing ?? 0);
    return items && Number.isInteger(pending) && pending >= 0
      ? reply({ items, pending }, 200)
      : reply({ error: "temporarily_unavailable" }, 503);
  } catch {
    return reply({ error: "temporarily_unavailable" }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return reply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 2048) return reply({ error: "invalid_request" }, 413);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) return reply({ error: "invalid_request" }, 413);
    input = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }

  const action = input?.action;
  const idempotencyKey = input?.idempotencyKey;
  const isCreate = action === "create";
  const isSetAmount = action === "set_amount";
  const name = typeof input?.name === "string" ? input.name.trim() : null;
  const valid =
    typeof idempotencyKey === "string" && UUID_V4.test(idempotencyKey) &&
    finiteNumber(input?.amount, 0, 100_000) &&
    ((isCreate && name !== null && name.length >= 1 && name.length <= 80 && !CONTROL_CHARACTERS.test(name) &&
      typeof input.category === "string" && CATEGORIES.has(input.category) &&
      typeof input.unit === "string" && UNITS.has(input.unit) &&
      finiteNumber(input.minAmount, 0, 100_000)) ||
    (isSetAmount && Number.isInteger(input.productId) && finiteNumber(input.productId, 1, 2_147_483_647)));
  if (!valid) return reply({ error: "invalid_request" }, 400);

  const config = configuration();
  if (!config) return reply({ error: "temporarily_unavailable" }, 503);
  try {
    const response = await rpc(config, "embe_submit_inventory_action", {
      p_idempotency_key: idempotencyKey,
      p_action_type: action,
      p_product_id: isSetAmount ? input.productId : null,
      p_name: isCreate ? name : null,
      p_category: isCreate ? input.category : null,
      p_unit: isCreate ? input.unit : null,
      p_amount: input.amount,
      p_min_amount: isCreate ? input.minAmount : null
    });
    return response.ok ? reply({ status: "accepted" }, 202) : reply({ error: "temporarily_unavailable" }, 503);
  } catch {
    return reply({ error: "temporarily_unavailable" }, 503);
  }
}
