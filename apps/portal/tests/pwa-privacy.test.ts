import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

import nextConfig from "../next.config";
import manifest from "../src/app/manifest";
import robots from "../src/app/robots";

describe("private installable portal", () => {
  it("provides an installable mobile app manifest", () => {
    const appManifest = manifest();

    expect(appManifest.lang).toBe("vi");
    expect(appManifest.id).toBe("/");
    expect(appManifest.scope).toBe("/");
    expect(appManifest.start_url).toBe("/");
    expect(appManifest.display).toBe("standalone");
    expect(appManifest.shortcuts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Ghi lại", url: "/ghi-lai" }),
      expect.objectContaining({ name: "Kế hoạch", url: "/ke-hoach" }),
      expect.objectContaining({ name: "Kỷ niệm", url: "/ky-niem" })
    ]));
    expect(appManifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" })
    ]));
    expect(existsSync(join(process.cwd(), "src", "app", "apple-icon.png"))).toBe(true);
  });

  it("explicitly blocks search-engine crawling", () => {
    const policy = robots();

    expect(policy.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(policy.sitemap).toBeUndefined();
  });

  it("adds browser security and no-index headers to every route", async () => {
    const rules = await nextConfig.headers?.();
    const everyRoute = rules?.find((rule) => rule.source === "/(.*)");
    const headers = Object.fromEntries((everyRoute?.headers ?? []).map(({ key, value }) => [key, value]));

    expect(everyRoute).toBeDefined();
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("https://static.cloudflareinsights.com");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Robots-Tag"]).toContain("noindex");
  });

  it("allows signed browser uploads only to the EmBe Supabase project", async () => {
    const rules = await nextConfig.headers?.();
    const everyRoute = rules?.find((rule) => rule.source === "/(.*)");
    const headers = Object.fromEntries((everyRoute?.headers ?? []).map(({ key, value }) => [key, value]));
    const connectSource = headers["Content-Security-Policy"]
      ?.split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("connect-src "));

    expect(connectSource).toContain("https://tpqqzowhndbkmkckpbgv.supabase.co");
    expect(connectSource).not.toContain("https://*.supabase.co");
  });

  it("lets the browser revalidate the service worker on every launch", async () => {
    const rules = await nextConfig.headers?.();
    const worker = rules?.find((rule) => rule.source === "/sw.js");
    const headers = Object.fromEntries((worker?.headers ?? []).map(({ key, value }) => [key, value]));

    expect(worker).toBeDefined();
    expect(headers["Cache-Control"]).toContain("max-age=0");
    expect(headers["Service-Worker-Allowed"]).toBe("/");
  });
});
