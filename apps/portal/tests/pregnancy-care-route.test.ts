import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { GET, PATCH } from "../src/app/api/pregnancy/care/route";
import { GET as probeHealth, POST as createDevice, PUT as ingestHealth } from "../src/app/api/pregnancy/iphone-health/route";
import { estimatedEnergyTarget, PREGNANCY_NUTRIENTS } from "../src/lib/pregnancy-nutrition";

const originalEnvironment = { ...process.env };
const planId = "11111111-1111-4111-8111-111111111111";

function cookie(): string { return `embe_session=${createSessionCookie("server-secret")}`; }
function request(url: string, method: string, body?: unknown, authenticated = true): Request {
  return new Request(url, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "https://embe.hieu.asia", ...(authenticated ? { cookie: cookie() } : {}) }
  });
}

const snapshot = { profile: null, plans: [], iphone_health: null, iphone_devices: [] };

describe("private pregnancy care and iPhone health APIs", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    rpc.mockReset();
  });
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("keeps care reads and mutations behind the family session", async () => {
    expect((await GET(request("https://embe.hieu.asia/api/pregnancy/care?day=2026-09-01", "GET", undefined, false))).status).toBe(401);
    expect((await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", { action: "intake", day: "2026-09-01", planId, slot: 1, taken: true }, false))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves a bounded profile and returns a refreshed snapshot", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "profile", day: "2026-09-01", profile: {
        birthDate: "1995-05-20", heightCm: 160, prePregnancyWeightKg: 52,
        activityLevel: "low_active", clinicianEnergyTargetKcal: null
      }
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_save_pregnancy_wellness_profile", expect.objectContaining({ p_height_cm: 160 }));
  });

  it("stores only an explicit doctor plan and whitelisted nutrient amounts", async () => {
    rpc.mockResolvedValueOnce({ data: planId, error: null }).mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "plan", day: "2026-09-01", plan: {
        id: null, category: "supplement", name: "Prenatal theo đơn", doseDisplay: "1 viên",
        timesPerDay: 1, instructions: "Sau ăn", confirmedByClinician: true, active: true,
        nutrientAmounts: { iron_mg: 27, folate_ug: 600, invented_drug: 999 }
      }
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_save_pregnancy_care_plan", expect.objectContaining({
      p_nutrient_amounts: { iron_mg: 27, folate_ug: 600 }
    }));
  });

  it("rejects impossible doses before storage", async () => {
    const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "plan", day: "2026-09-01", plan: {
        id: null, category: "medicine", name: "", doseDisplay: "1 viên",
        timesPerDay: 9, instructions: "", confirmedByClinician: false, active: true, nutrientAmounts: {}
      }
    }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("issues a one-time opaque iPhone token and stores only its hash", async () => {
    rpc.mockResolvedValueOnce({ data: planId, error: null });
    const response = await createDevice(request("https://embe.hieu.asia/api/pregnancy/iphone-health", "POST", { label: "iPhone Mẹ Ngân" }));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.token).toMatch(/^embe_health_/);
    const stored = rpc.mock.calls[0][1].p_token_hash;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(payload.token);
  });

  it("accepts selected daily aggregates with a device token and rejects raw excess", async () => {
    const token = `embe_health_${"a".repeat(43)}`;
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const accepted = await ingestHealth(new Request("https://embe.hieu.asia/api/pregnancy/iphone-health", {
      method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-09-01", steps: 5200, sleepMinutes: 450, weightKg: 53.2 })
    }));
    expect(accepted.status).toBe(202);
    const rejected = await ingestHealth(new Request("https://embe.hieu.asia/api/pregnancy/iphone-health", {
      method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ day: "2026-09-01", steps: 5200, latitude: 10.7 })
    }));
    expect(rejected.status).toBe(400);
  });

  it("lets an iPhone verify its private receiver before sending health data", async () => {
    const token = `embe_health_${"a".repeat(43)}`;
    rpc.mockResolvedValueOnce({
      data: { device_id: planId, label: "iPhone của Mẹ Ngân", last_synced_at: null }, error: null
    });
    const response = await probeHealth(new Request("https://embe.hieu.asia/api/pregnancy/iphone-health", {
      headers: { authorization: `Bearer ${token}` }
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      connected: true, deviceId: planId, label: "iPhone của Mẹ Ngân", lastSyncedAt: null
    });
    expect(rpc).toHaveBeenCalledWith("embe_probe_iphone_health", { p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("accepts the reviewed open-source Apple Shortcut daily export format", async () => {
    const token = `embe_health_${"a".repeat(43)}`;
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const response = await createDevice(new Request("https://embe.hieu.asia/api/pregnancy/iphone-health", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ data: [
        { type: "Steps", date: "2026-09-01T00:00:00+07:00", value: "5432", unit: "count" },
        { type: "Active Calories", date: "2026-09-01T00:00:00+07:00", value: "321.5", unit: "kcal" }
      ] })
    }));
    expect(response.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("embe_ingest_iphone_health", expect.objectContaining({
      p_day: "2026-09-01", p_steps: 5432, p_active_energy_kcal: 321.5
    }));
  });
});

describe("pregnancy nutrition references", () => {
  it("contains the NIH key nutrient set and calculates a profile-based estimate", () => {
    expect(PREGNANCY_NUTRIENTS.find((item) => item.key === "folate_ug")?.target).toBe(600);
    expect(PREGNANCY_NUTRIENTS.find((item) => item.key === "iron_mg")?.target).toBe(27);
    expect(estimatedEnergyTarget({ birthDate: "1995-05-20", heightCm: 160, prePregnancyWeightKg: 52,
      activityLevel: "low_active", clinicianEnergyTargetKcal: null }, 18, new Date("2026-09-01T00:00:00Z"))).toBeGreaterThan(1800);
  });
});
