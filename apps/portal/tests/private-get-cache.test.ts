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
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
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

  it("keeps successful private data in memory for five minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T08:00:00Z"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ value: 1 }))
      .mockResolvedValueOnce(Response.json({ value: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await (await cachedPrivateGet("/api/pregnancy/records")).json()).toEqual({ value: 1 });
    vi.advanceTimersByTime(299_000);
    expect(await (await cachedPrivateGet("/api/pregnancy/records")).json()).toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    expect(await (await cachedPrivateGet("/api/pregnancy/records")).json()).toEqual({ value: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates only the matching private data group after a write", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ records: 1 }))
      .mockResolvedValueOnce(Response.json({ health: 1 }))
      .mockResolvedValueOnce(Response.json({ records: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await cachedPrivateGet("/api/pregnancy/records");
    await cachedPrivateGet("/api/pregnancy/health?days=28");
    clearPrivateGetCache("/api/pregnancy/records");
    expect(await (await cachedPrivateGet("/api/pregnancy/records")).json()).toEqual({ records: 2 });
    expect(await (await cachedPrivateGet("/api/pregnancy/health?days=28")).json()).toEqual({ health: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
