import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const rpc = vi.fn();
const revalidateFamilyViews = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("../src/lib/family-view-revalidation", () => ({ revalidateFamilyViews }));

import { GET, PATCH } from "../src/app/api/pregnancy/profile/route";

const originalEnvironment = { ...process.env };

function request(method: string, body?: unknown, authenticated = true): Request {
  return new Request("https://embe.hieu.asia/api/pregnancy/profile", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "https://embe.hieu.asia",
      ...(authenticated ? { cookie: `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}` } : {})
    }
  });
}

const snapshot = {
  due_date: "2027-04-20",
  due_date_source: "estimated_lmp",
  lmp_date: "2026-07-14",
  gestation_type: "singleton",
  blood_group: "A",
  rh_factor: "positive",
  allergies: "Không có",
  medical_notes: "",
  contacts: []
};

describe("pregnancy profile API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    rpc.mockReset();
    revalidateFamilyViews.mockClear();
  });

  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("keeps reads and writes behind the family session", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    expect((await PATCH(request("PATCH", { action: "profile" }, false))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the saved pregnancy and care-team profile", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ profile: {
      dueDate: "2027-04-20", dueDateSource: "estimated_lmp", lmpDate: "2026-07-14", gestationType: "singleton",
      bloodGroup: "A", rhFactor: "positive", allergies: "Không có", medicalNotes: "", contacts: []
    } });
  });

  it("validates and saves a bounded pregnancy profile", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await PATCH(request("PATCH", {
      action: "profile",
      profile: {
        dueDate: "2027-04-20", dueDateSource: "estimated_lmp", lmpDate: "2026-07-14", gestationType: "singleton",
        bloodGroup: "A", rhFactor: "positive", allergies: "Không có", medicalNotes: ""
      }
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_save_pregnancy_profile", expect.objectContaining({
      p_due_date: "2027-04-20", p_due_date_source: "estimated_lmp", p_lmp_date: "2026-07-14", p_gestation_type: "singleton"
    }));
    expect(revalidateFamilyViews).toHaveBeenCalledOnce();
  });

  it("adds a callable care contact without exposing provider details", async () => {
    rpc.mockResolvedValueOnce({ data: "11111111-1111-4111-8111-111111111111", error: null })
      .mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await PATCH(request("PATCH", {
      action: "contact",
      contact: { id: null, kind: "doctor", name: "Bác sĩ Lan", organization: "Phòng khám", phone: "0901234567", note: "", primary: true }
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "embe_save_pregnancy_care_contact", expect.objectContaining({ p_phone: "0901234567" }));
  });

  it("rejects unknown medical fields and invalid phone values", async () => {
    const response = await PATCH(request("PATCH", {
      action: "contact",
      contact: { id: null, kind: "doctor", name: "Bác sĩ", organization: "", phone: "javascript:alert(1)", note: "", primary: true, diagnosis: "x" }
    }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
