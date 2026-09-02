import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type RateDecision = { allowed: boolean; retryAfterSeconds: number };

function headerIp(value: string | null): string | null {
  const candidate = value?.split(",", 1)[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

function trustedClientIp(request: Request): string {
  if (process.env.EMBE_TRUST_CLOUDFLARE_PROXY === "1") {
    return headerIp(request.headers.get("cf-connecting-ip")) ?? "unknown";
  }
  if (process.env.VERCEL === "1") {
    return headerIp(request.headers.get("x-vercel-forwarded-for")) ?? "unknown";
  }
  return "unknown";
}

export function loginRateKey(request: Request, secret: string, scope = "login"): string {
  return createHmac("sha256", secret)
    .update(`${scope}-ip\0${trustedClientIp(request)}`)
    .digest("hex");
}

async function rateRpc(name: string, body: Record<string, unknown>): Promise<unknown | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    const response = await fetch(`${parsed.origin}/rest/v1/rpc/${name}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) return null;
    return response.status === 204 ? {} : response.json();
  } catch {
    return null;
  }
}

function decision(value: unknown): RateDecision | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.allowed !== "boolean" || !Number.isInteger(row.retry_after_seconds)) return null;
  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Math.min(900, Number(row.retry_after_seconds)))
  };
}

export async function checkLoginRate(keyHash: string, now: Date): Promise<RateDecision | null> {
  return decision(await rateRpc("embe_check_login_rate_limit", {
    p_key_hash: keyHash,
    p_now: now.toISOString()
  }));
}

export async function recordLoginFailure(keyHash: string, now: Date): Promise<RateDecision | null> {
  return decision(await rateRpc("embe_record_login_failure", {
    p_key_hash: keyHash,
    p_now: now.toISOString()
  }));
}

export async function resetLoginRate(keyHash: string): Promise<void> {
  await rateRpc("embe_reset_login_rate_limit", { p_key_hash: keyHash });
}
