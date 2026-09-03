import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activeSessionState, clearSessionValidationCache } from "../src/lib/session-store";

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("session validation cache", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "secret";
    clearSessionValidationCache();
  });

  afterEach(() => {
    clearSessionValidationCache();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  it("coalesces the burst of checks made while one private page is loading", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(true));
    vi.stubGlobal("fetch", fetchMock);

    const states = await Promise.all([
      activeSessionState(sessionId),
      activeSessionState(sessionId),
      activeSessionState(sessionId)
    ]);

    expect(states).toEqual(["active", "active", "active"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps normal mobile navigation inside one validation window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T08:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(Response.json(true));
    vi.stubGlobal("fetch", fetchMock);

    await activeSessionState(sessionId);
    await vi.advanceTimersByTimeAsync(25_000);
    await activeSessionState(sessionId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_001);
    await activeSessionState(sessionId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("can invalidate a session immediately after logout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(true));
    vi.stubGlobal("fetch", fetchMock);

    await activeSessionState(sessionId);
    clearSessionValidationCache(sessionId);
    await activeSessionState(sessionId);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
