import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "../src/app/api/postpartum/health/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };
const cookie = () => `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`;

describe("private postpartum health endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{
      day: "2026-09-01", lochia: "light", pain: 2, temperature_c: 36.8,
      systolic: 112, diastolic: 72, wound_status: "comfortable", urination: "comfortable",
      digestion: "usual", pelvic_pain: 1, breast_discomfort: 2, feeding_difficulty: false,
      sleep_minutes: 360, exhaustion: 3, support: 4, mood: 4,
      phq2_interest: 0, phq2_depressed: 0, notes: "Ổn"
    }])));
  });

  afterEach(() => { process.env = { ...originalEnvironment }; vi.unstubAllGlobals(); });

  it("rejects unauthenticated reads", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/postpartum/health?end=2026-09-01&days=42"));
    expect(response.status).toBe(401);
  });

  it("reads a bounded recovery history", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/postpartum/health?end=2026-09-01&days=42", { headers: { cookie: cookie() } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ history: [{ day: "2026-09-01", lochia: "light", mood: 4 }] });
  });

  it("rejects invalid values before storage", async () => {
    const response = await PATCH(new Request("https://embe.hieu.asia/api/postpartum/health", {
      method: "PATCH",
      headers: { cookie: cookie(), origin: "https://embe.hieu.asia", "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-09-01", temperatureC: 50 })
    }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves a bounded daily recovery snapshot", async () => {
    const response = await PATCH(new Request("https://embe.hieu.asia/api/postpartum/health", {
      method: "PATCH",
      headers: { cookie: cookie(), origin: "https://embe.hieu.asia", "content-type": "application/json" },
      body: JSON.stringify({
        day: "2026-09-01", lochia: "light", pain: 2, temperatureC: 36.8,
        systolic: 112, diastolic: 72, woundStatus: "comfortable", urination: "comfortable",
        digestion: "usual", pelvicPain: 1, breastDiscomfort: 2, feedingDifficulty: false,
        sleepMinutes: 360, exhaustion: 3, support: 4, mood: 4,
        phq2Interest: 0, phq2Depressed: 0, notes: "Ổn"
      })
    }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("embe_save_postpartum_health"), expect.objectContaining({ method: "POST" }));
  });
});
