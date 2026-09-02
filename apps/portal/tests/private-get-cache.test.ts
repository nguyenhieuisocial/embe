import { afterEach, describe, expect, it, vi } from "vitest";

import { cachedPrivateGet, clearPrivateGetCache } from "../src/lib/private-get-cache";

describe("short-lived private GET cache", () => {
  afterEach(() => {
    clearPrivateGetCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("coalesces duplicate requests and gives each consumer its own response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ value: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      cachedPrivateGet("/api/meals?days=7"),
      cachedPrivateGet("/api/meals?days=7")
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await first.json()).toEqual({ value: 1 });
    expect(await second.json()).toEqual({ value: 1 });
  });

  it("does not retain failed responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ recovered: true }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await cachedPrivateGet("/api/pregnancy")).status).toBe(503);
    expect((await cachedPrivateGet("/api/pregnancy")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
