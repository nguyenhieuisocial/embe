import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const PORTAL_URL = "https://embe.hieu.asia";

export function createShortSession(secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiresAt = nowSeconds + 300;
  const signature = createHmac("sha256", secret).update(String(expiresAt)).digest("hex");
  return `${expiresAt}.${signature}`;
}

export function validateProcurementResponse(status, payload) {
  if (
    status !== 200 || !payload || typeof payload !== "object" ||
    !Array.isArray(payload.proposals) || payload.proposals.length > 100 ||
    !Number.isInteger(payload.pending) || payload.pending < 0
  ) throw new Error("procurement production smoke check failed");
  return { status: "ok", proposal_count: payload.proposals.length, pending: payload.pending };
}

async function main() {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  if (!secret) throw new Error("configuration_missing");
  const response = await fetch(`${PORTAL_URL}/api/procurement`, {
    cache: "no-store",
    headers: { cookie: `embe_session=${createShortSession(secret)}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200) throw new Error(`http_${response.status}`);
  const result = validateProcurementResponse(response.status, await response.json());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const code = /^http_\d{3}$/.test(String(error?.message)) ? error.message : "invalid_response";
    process.stderr.write(`${JSON.stringify({ status: "failed", error_code: code })}\n`);
    process.exitCode = 1;
  });
}
