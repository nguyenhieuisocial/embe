import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("privacy-safe PWA runtime", () => {
  it("ships a service worker and an offline route", () => {
    expect(existsSync(join(process.cwd(), "public", "sw.js"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src", "app", "offline", "page.tsx"))).toBe(true);
  });

  it("never caches private pages, API responses, authentication or family media", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

    expect(source).toContain('request.mode === "navigate"');
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain('url.pathname.startsWith("/api/media/")');
    expect(source).not.toMatch(/cache\.put\([^\n]*(?:api|media|navigate)/i);
  });

  it("receives a private push and opens its EmBe destination", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("clients.openWindow");
  });

  it("reports successful family mutations without delaying the original response", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    expect(source).toContain("familyActivityKind");
    expect(source).toContain('request.method !== "GET"');
    expect(source).toContain('fetch("/api/notifications/activity"');
    expect(source).toContain("event.respondWith(responsePromise)");
    expect(source).toContain("event.waitUntil(");
    expect(source).toContain('pathname.startsWith("/api/notifications/")');
    expect(source).toContain("ACTIVITY_DEDUP_MS");
  });

  it("keeps the device identity when iOS suspends and restarts the service worker", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

    expect(source).toContain("persistSourceDeviceId");
    expect(source).toContain("readSourceDeviceId");
    expect(source).toContain("DEVICE_CONTEXT_CACHE_KEY");
    expect(source).toContain("event.waitUntil(persistSourceDeviceId");
  });

  it("notifies open EmBe windows that another family device changed data", () => {
    const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    expect(source).toContain('type: "EMBE_FAMILY_ACTIVITY"');
    expect(source).toContain("client.postMessage");
  });

  it("keeps generated illustrations within the mobile performance budget", () => {
    for (const name of ["family-thread-hero.webp", "memory-album-empty.webp", "pregnancy-care.webp"]) {
      const path = join(process.cwd(), "public", "illustrations", name);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeLessThan(250_000);
    }
  });
});
