import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "../src/app/api/family/lifecycle/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };

function sessionCookie(): string {
  return `embe_session=${createSessionCookie("server-secret")}`;
}

function patchRequest(body: unknown, origin = "https://embe.hieu.asia"): Request {
  return new Request("https://embe.hieu.asia/api/family/lifecycle", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: sessionCookie(), origin },
    body: JSON.stringify(body)
  });
}

describe("private family lifecycle endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      birth_occurred_at: "2026-08-30T08:15:00+00:00",
      birth_method: "vaginal",
      baby_sex: "female",
      gestational_weeks: 39,
      gestational_days: 2,
      birth_weight_g: 3200,
      birth_length_cm: 50,
      birth_head_cm: 34.5,
      birth_facility: "Bệnh viện",
      birth_clinician: "Bác sĩ",
      premature: false,
      low_birth_weight: false,
      special_monitoring: false,
      special_monitoring_notes: null,
      discharged_at: null,
      discharge_notes: null,
      has_birth_record: true
    })));
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects unauthenticated reads", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/family/lifecycle"));
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a normalized private birth record", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/family/lifecycle", {
      headers: { cookie: sessionCookie() }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      birthOccurredAt: "2026-08-30T08:15:00.000Z",
      birthMethod: "vaginal",
      babySex: "female",
      gestationalWeeks: 39,
      gestationalDays: 2,
      hasBirthRecord: true
    });
  });

  it("saves a complete bounded birth event", async () => {
    const response = await PATCH(patchRequest({
      birthOccurredAt: "2026-08-30T15:15:00+07:00",
      birthMethod: "vaginal",
      babySex: "female",
      gestationalWeeks: 39,
      gestationalDays: 2,
      birthWeightG: 3200,
      birthLengthCm: 50,
      birthHeadCm: 34.5,
      birthFacility: "Bệnh viện",
      birthClinician: "Bác sĩ",
      premature: false,
      lowBirthWeight: false,
      specialMonitoring: false,
      specialMonitoringNotes: null,
      dischargedAt: null,
      dischargeNotes: null
    }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_save_family_lifecycle",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body))).toMatchObject({ p_baby_sex: "female" });
  });

  it("rejects impossible measurements and foreign origins", async () => {
    expect((await PATCH(patchRequest({ birthOccurredAt: "2026-08-30T08:15:00Z", birthWeightG: 99 }))).status).toBe(400);
    expect((await PATCH(patchRequest({ birthOccurredAt: "2026-08-30T08:15:00Z" }, "https://attacker.example"))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a baby sex value that WHO growth standards cannot use", async () => {
    const response = await PATCH(patchRequest({
      birthOccurredAt: "2026-08-30T15:15:00+07:00", birthMethod: "vaginal", babySex: "unspecified",
      gestationalWeeks: null, gestationalDays: null, birthWeightG: null, birthLengthCm: null,
      birthHeadCm: null, birthFacility: null, birthClinician: null, premature: false,
      lowBirthWeight: false, specialMonitoring: false, specialMonitoringNotes: null,
      dischargedAt: null, dischargeNotes: null
    }));
    expect(response.status).toBe(400);
  });
});
