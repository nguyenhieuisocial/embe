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

  it("returns the requested 7 or 30 day iPhone health history with the care snapshot", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot, error: null }).mockResolvedValueOnce({
      data: [{ day: "2026-09-01", height_cm: 160, steps: 5200, metric_synced_at: { heightCm: "2026-09-01T08:00:00Z" } }], error: null
    });
    const response = await GET(request("https://embe.hieu.asia/api/pregnancy/care?day=2026-09-01&days=30", "GET"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ snapshot: {
      ...snapshot, iphone_health_history: [{ day: "2026-09-01", height_cm: 160, steps: 5200, metric_synced_at: { heightCm: "2026-09-01T08:00:00Z" } }]
    } });
    expect(rpc).toHaveBeenNthCalledWith(2, "embe_get_iphone_health_history", { p_end_day: "2026-09-01", p_days: 30 });
  });

  it("defaults iPhone health history to 7 days and rejects unsupported windows", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot, error: null }).mockResolvedValueOnce({ data: [], error: null });
    const accepted = await GET(request("https://embe.hieu.asia/api/pregnancy/care?day=2026-09-01", "GET"));
    const rejected = await GET(request("https://embe.hieu.asia/api/pregnancy/care?day=2026-09-01&days=28", "GET"));
    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(400);
    expect(rpc).toHaveBeenNthCalledWith(2, "embe_get_iphone_health_history", { p_end_day: "2026-09-01", p_days: 7 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("saves a bounded profile and returns a refreshed snapshot", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "profile", day: "2026-09-01", profile: {
        birthDate: "1995-05-20", heightCm: 160, prePregnancyWeightKg: 52,
        activityLevel: "low_active", clinicianEnergyTargetKcal: null,
        clinicianWeightGainMinKg: 11.5, clinicianWeightGainMaxKg: 16
      }
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_save_pregnancy_wellness_profile", expect.objectContaining({
      p_height_cm: 160, p_clinician_weight_gain_min_kg: 11.5, p_clinician_weight_gain_max_kg: 16
    }));
  });

  it("stores only an explicit doctor plan and whitelisted nutrient amounts", async () => {
    rpc.mockResolvedValueOnce({ data: planId, error: null }).mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "plan", day: "2026-09-01", plan: {
        id: null, category: "supplement", name: "Prenatal theo đơn", doseDisplay: "1 viên",
        timesPerDay: 1, instructions: "Sau ăn", confirmedByClinician: true, active: true,
        reminderTimes: ["08:00"], nutrientAmounts: { iron_mg: 27, folate_ug: 600, invented_drug: 999 }
      }
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_save_pregnancy_care_plan", expect.objectContaining({
      p_nutrient_amounts: { iron_mg: 27, folate_ug: 600 }, p_reminder_times: ["08:00"]
    }));
  });

  it("records taken, skipped or deferred dose states with a short reason", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "intake", day: "2026-09-01", planId, slot: 1, status: "deferred", reason: "Đợi sau bữa sáng"
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_record_pregnancy_care_intake", {
      p_plan_id: planId, p_day: "2026-09-01", p_slot: 1, p_status: "deferred", p_reason: "Đợi sau bữa sáng"
    });
  });

  it("pauses and reactivates only the requested care plan", async () => {
    rpc.mockResolvedValue({ data: snapshot, error: null });
    const paused = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "planState", day: "2026-09-01", planId, active: false
    }));
    const active = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "planState", day: "2026-09-01", planId, active: true
    }));
    expect([paused.status, active.status]).toEqual([200, 200]);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_set_pregnancy_care_plan_active", { p_plan_id: planId, p_active: false });
    expect(rpc).toHaveBeenNthCalledWith(3, "embe_set_pregnancy_care_plan_active", { p_plan_id: planId, p_active: true });
  });

  it("rejects unknown adherence states, long reasons and extra mutation fields", async () => {
    const invalidState = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "intake", day: "2026-09-01", planId, slot: 1, status: "recommended", reason: ""
    }));
    const longReason = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "intake", day: "2026-09-01", planId, slot: 1, status: "skipped", reason: "x".repeat(121)
    }));
    const extra = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "planState", day: "2026-09-01", planId, active: false, dose: "2 viên"
    }));
    expect([invalidState.status, longReason.status, extra.status]).toEqual([400, 400, 400]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects missing, duplicate or unsorted dose reminder times", async () => {
    const base = {
      id: null, category: "supplement", name: "Prenatal theo đơn", doseDisplay: "1 viên",
      timesPerDay: 2, instructions: "Sau ăn", confirmedByClinician: true, active: true,
      nutrientAmounts: {}
    };
    for (const reminderTimes of [["08:00"], ["08:00", "08:00"], ["20:00", "08:00"]]) {
      const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
        action: "plan", day: "2026-09-01", plan: { ...base, reminderTimes }
      }));
      expect(response.status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects impossible doses before storage", async () => {
    const response = await PATCH(request("https://embe.hieu.asia/api/pregnancy/care", "PATCH", {
      action: "plan", day: "2026-09-01", plan: {
        id: null, category: "medicine", name: "", doseDisplay: "1 viên",
        timesPerDay: 9, reminderTimes: [], instructions: "", confirmedByClinician: false, active: true, nutrientAmounts: {}
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
      body: JSON.stringify({
        day: "2026-09-01", steps: 5200, sleepMinutes: 450, weightKg: 53.2, heightCm: 160,
        distanceM: 4100, restingHeartRateBpm: 68, respiratoryRate: 15.2, oxygenSaturationPercent: 98,
        bodyTemperatureC: 36.7, wristTemperatureC: 36.4, hrvMs: 42, exerciseMinutes: 28,
        mindfulnessMinutes: 10, systolic: 112, diastolic: 72
      })
    }));
    expect(accepted.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("embe_ingest_iphone_health_v2", expect.objectContaining({
      p_height_cm: 160, p_distance_m: 4100, p_resting_heart_rate_bpm: 68,
      p_oxygen_saturation_percent: 98, p_hrv_ms: 42, p_systolic: 112, p_diastolic: 72
    }));
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
    expect(rpc).toHaveBeenCalledWith("embe_ingest_iphone_health_v2", expect.objectContaining({
      p_day: "2026-09-01", p_steps: 5432, p_active_energy_kcal: 321.5
    }));
  });

  it("normalizes extended Apple Health Shortcut samples", async () => {
    const token = `embe_health_${"a".repeat(43)}`;
    rpc.mockResolvedValue({ data: true, error: null });
    const response = await createDevice(new Request("https://embe.hieu.asia/api/pregnancy/iphone-health", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ data: [
        { type: "Height", date: "2026-09-01T08:00:00+07:00", value: 1.6, unit: "m" },
        { type: "Walking + Running Distance", date: "2026-09-01T08:00:00+07:00", value: 4.2, unit: "km" },
        { type: "Resting Heart Rate", date: "2026-09-01T08:00:00+07:00", value: 67, unit: "bpm" },
        { type: "Respiratory Rate", date: "2026-09-01T08:00:00+07:00", value: 15, unit: "breaths/min" },
        { type: "Blood Oxygen", date: "2026-09-01T08:00:00+07:00", value: 0.98, unit: "%" },
        { type: "Body Temperature", date: "2026-09-01T08:00:00+07:00", value: 98.24, unit: "°F" },
        { type: "Wrist Temperature", date: "2026-09-01T08:00:00+07:00", value: 36.4, unit: "°C" },
        { type: "Heart Rate Variability", date: "2026-09-01T08:00:00+07:00", value: 42, unit: "ms" },
        { type: "Exercise Time", date: "2026-09-01T08:00:00+07:00", value: 28, unit: "min" },
        { type: "Mindful Minutes", date: "2026-09-01T08:00:00+07:00", value: 10, unit: "min" },
        { type: "Blood Pressure Systolic", date: "2026-09-01T08:00:00+07:00", value: 112, unit: "mmHg" },
        { type: "Blood Pressure Diastolic", date: "2026-09-01T08:00:00+07:00", value: 72, unit: "mmHg" }
      ] })
    }));
    expect(response.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("embe_ingest_iphone_health_v2", expect.objectContaining({
      p_height_cm: 160, p_distance_m: 4200, p_resting_heart_rate_bpm: 67,
      p_respiratory_rate: 15, p_oxygen_saturation_percent: 98, p_body_temperature_c: 36.8,
      p_wrist_temperature_c: 36.4, p_hrv_ms: 42, p_exercise_minutes: 28,
      p_mindfulness_minutes: 10, p_systolic: 112, p_diastolic: 72
    }));
  });

  it("accepts a bounded 31-day Apple Health backfill", async () => {
    const token = `embe_health_${"a".repeat(43)}`;
    rpc.mockResolvedValue({ data: true, error: null });
    const data = Array.from({ length: 31 }, (_, index) => ({
      type: "Steps", date: `2026-08-${String(index + 1).padStart(2, "0")}T08:00:00+07:00`, value: 5000 + index, unit: "count"
    }));
    const response = await createDevice(new Request("https://embe.hieu.asia/api/pregnancy/iphone-health", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ data })
    }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, days: 31 });
    expect(rpc).toHaveBeenCalledTimes(31);
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
