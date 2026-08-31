import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import manifest from "../src/app/manifest";
import robots from "../src/app/robots";

describe("private installable portal", () => {
  it("provides an installable mobile app manifest", () => {
    const appManifest = manifest();

    expect(appManifest.lang).toBe("vi");
    expect(appManifest.start_url).toBe("/");
    expect(appManifest.display).toBe("standalone");
    expect(appManifest.icons?.length).toBeGreaterThan(0);
  });

  it("explicitly blocks search-engine crawling", () => {
    const policy = robots();

    expect(policy.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(policy.sitemap).toBeUndefined();
  });

  it("adds browser security and no-index headers to every route", async () => {
    const rules = await nextConfig.headers?.();
    const headers = Object.fromEntries((rules?.[0].headers ?? []).map(({ key, value }) => [key, value]));

    expect(rules?.[0].source).toBe("/(.*)");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("https://static.cloudflareinsights.com");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Robots-Tag"]).toContain("noindex");
  });
});
