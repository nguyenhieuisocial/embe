import { verifySessionCookie } from "../../../lib/portal-auth";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const STATES = new Set(["DRAFT", "REVIEWED", "APPROVED", "ORDERED", "RECEIVED", "CANCELLED"]);
const TARGETS = new Set(["REVIEWED", "APPROVED", "ORDERED", "RECEIVED", "CANCELLED"]);

type Proposal = {
  id: string;
  productName: string;
  state: string;
  packs: number;
  requiredUnits: number;
  estimatedTotalVnd: number;
  proposalHash: string;
  updatedAt: string;
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
  return baseUrl?.startsWith("https://") && secretKey
    ? { baseUrl: baseUrl.replace(/\/$/, ""), secretKey }
    : null;
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

function normalizeProposals(value: unknown): Proposal[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const proposals: Proposal[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (
      typeof item.id !== "string" || !UUID_V4.test(item.id) ||
      typeof item.product_name !== "string" || item.product_name.length < 1 || item.product_name.length > 80 ||
      typeof item.state !== "string" || !STATES.has(item.state) ||
      !Number.isInteger(item.packs) || !finiteNumber(item.packs, 1, 1000) ||
      !finiteNumber(item.required_units, 0, 1_000_000) ||
      !finiteNumber(item.estimated_total_vnd, 0, 1_000_000_000_000) ||
      typeof item.proposal_hash !== "string" || !SHA256.test(item.proposal_hash) ||
      typeof item.updated_at !== "string" || !Number.isFinite(Date.parse(item.updated_at))
    ) return null;
    proposals.push({
      id: item.id,
      productName: item.product_name,
      state: item.state,
      packs: item.packs,
      requiredUnits: item.required_units,
      estimatedTotalVnd: item.estimated_total_vnd,
      proposalHash: item.proposal_hash,
      updatedAt: item.updated_at
    });
  }
  return proposals;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  const config = configuration();
  if (!config) return reply({ error: "temporarily_unavailable" }, 503);
  try {
    const query = new URLSearchParams({
      select: "id,product_name,state,packs,required_units,estimated_total_vnd,proposal_hash,updated_at",
      order: "updated_at.desc",
      limit: "100"
    });
    const [proposalResponse, queueResponse] = await Promise.all([
      fetch(`${config.baseUrl}/rest/v1/embe_procurement_proposal?${query}`, {
        cache: "no-store",
        headers: { Accept: "application/json", apikey: config.secretKey },
        signal: AbortSignal.timeout(8000)
      }),
      rpc(config, "embe_procurement_queue_status", {})
    ]);
    if (!proposalResponse.ok || !queueResponse.ok) return reply({ error: "temporarily_unavailable" }, 503);
    const proposals = normalizeProposals(await proposalResponse.json());
    const queue = await queueResponse.json() as Record<string, unknown>;
    const pending = Number(queue.pending ?? 0) + Number(queue.processing ?? 0);
    return proposals && Number.isInteger(pending) && pending >= 0
      ? reply({ proposals, pending }, 200)
      : reply({ error: "temporarily_unavailable" }, 503);
  } catch {
    return reply({ error: "temporarily_unavailable" }, 503);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
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
  if (
    typeof input.idempotencyKey !== "string" || !UUID_V4.test(input.idempotencyKey) ||
    typeof input.proposalId !== "string" || !UUID_V4.test(input.proposalId) ||
    typeof input.target !== "string" || !TARGETS.has(input.target) ||
    typeof input.proposalHash !== "string" || !SHA256.test(input.proposalHash)
  ) return reply({ error: "invalid_request" }, 400);

  const config = configuration();
  if (!config) return reply({ error: "temporarily_unavailable" }, 503);
  try {
    const response = await rpc(config, "embe_submit_procurement_action", {
      p_idempotency_key: input.idempotencyKey,
      p_proposal_id: input.proposalId,
      p_target_state: input.target,
      p_expected_hash: input.proposalHash
    });
    return response.ok ? reply({ status: "accepted" }, 202) : reply({ error: "temporarily_unavailable" }, 503);
  } catch {
    return reply({ error: "temporarily_unavailable" }, 503);
  }
}
