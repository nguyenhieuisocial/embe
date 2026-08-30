import { pathToFileURL } from "node:url";

const PORTAL_URL = "https://embe.hieu.asia";
const ANALYTICS_ID = "G-PTX99GX5F9";

export function isMainModule(importMetaUrl, argvPath) {
  return Boolean(argvPath) && importMetaUrl === pathToFileURL(argvPath).href;
}

export function validatePortalResponse({ status, headers, body }) {
  const csp = headers.get("content-security-policy") ?? "";
  const robotsHeader = headers.get("x-robots-tag") ?? "";
  const analyticsPresent = body.includes(ANALYTICS_ID);
  const noIndexPresent = /noindex/i.test(robotsHeader) || /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(body);
  const privacyHeadersPresent = /frame-ancestors\s+'none'/i.test(csp) && noIndexPresent;

  if (status !== 200 || !analyticsPresent || !privacyHeadersPresent) {
    throw new Error("public portal smoke check failed");
  }

  return {
    status: "ok",
    reachable: true,
    analytics_present: true,
    privacy_headers_present: true,
  };
}

async function main() {
  const response = await fetch(PORTAL_URL, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const result = validatePortalResponse({
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch(() => {
    process.stderr.write('{"status":"failed"}\n');
    process.exitCode = 1;
  });
}
