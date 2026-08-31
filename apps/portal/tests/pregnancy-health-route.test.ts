import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "../src/app/api/pregnancy/health/route";

const originalEnvironment = { ...process.env };

function sessionCookie(): string {
  return `embe_session=${createSessionCookie("server-secret")}`;
}

function request(body: unknown, authenticated = true): Request {
  return new Request("https://embe.hieu.asia/api/pregnancy/health", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { cookie: sessionCookie() } : {})
    },
    body: JSON.stringify(body)
  });
}

const databaseMetric = {
  day: "2026-09-01",
  weight_kg: 56.4,
  systolic: 112,
  diastolic: 72,
  sleep_minutes: 450,
  water_glasses: 7,
  movement_minutes: 25,
  wellbeing: 4,
  checklist_percent: 62
};

describe("private pregnancy health endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([databaseMetric])));
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects health reads and writes without an intact portal session", async () => {
    const read = await GET(new Request("https://embe.hieu.asia/api/pregnancy/health?end=2026-09-01"));
    const write = await PATCH(request({ day: "2026-09-01", weightKg: 56 }, false));

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a bounded 28-day history through the server-only RPC", async () => {
    const response = await GET(new Request(
      "https://embe.hieu.asia/api/pregnancy/health?end=2026-09-01&days=28",
      { headers: { cookie: sessionCookie() } }
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ history: [{
      day: "2026-09-01",
      weightKg: 56.4,
      systolic: 112,
      diastolic: 72,
      sleepMinutes: 450,
      waterGlasses: 7,
      movementMinutes: 25,
      wellbeing: 4,
      checklistPercent: 62
    }] });
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_get_pregnancy_health_history",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_end_day: "2026-09-01", p_days: 28 })
      })
    );
  });

  it("rejects invalid dates, history windows and metric ranges", async () => {
    const invalidDay = await PATCH(request({ day: "01-09-2026", weightKg: 56 }));
    const invalidPressure = await PATCH(request({ day: "2026-09-01", systolic: 500 }));
    const invalidWellbeing = await PATCH(request({ day: "2026-09-01", wellbeing: 6 }));
    const invalidWindow = await GET(new Request(
      "https://embe.hieu.asia/api/pregnancy/health?end=2026-09-01&days=365",
      { headers: { cookie: sessionCookie() } }
    ));

    expect([invalidDay.status, invalidPressure.status, invalidWellbeing.status, invalidWindow.status])
      .toEqual([400, 400, 400, 400]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves a bounded daily snapshot without free text", async () => {
    const metric = {
      day: "2026-09-01",
      weightKg: 56.4,
      systolic: 112,
      diastolic: 72,
      sleepMinutes: 450,
      waterGlasses: 7,
      movementMinutes: 25,
      wellbeing: 4
    };
    const response = await PATCH(request(metric));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_save_pregnancy_health",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          p_day: "2026-09-01",
          p_weight_kg: 56.4,
          p_systolic: 112,
          p_diastolic: 72,
          p_sleep_minutes: 450,
          p_water_glasses: 7,
          p_movement_minutes: 25,
          p_wellbeing: 4
        })
      })
    );
    expect(JSON.stringify(await response.json())).not.toContain("server-only-key");
  });

  it("fails closed when the private database is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const response = await PATCH(request({ day: "2026-09-01", weightKg: 56 }));

    expect(response.status).toBe(503);
  });
});
