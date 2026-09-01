import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/baby/medical/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };
const cookie = () => `embe_session=${createSessionCookie("server-secret")}`;

describe("private baby medical records", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{
      id: "2e39dad3-c419-458d-beba-9c2063289792", kind: "vaccination", status: "planned",
      occurred_at: "2026-10-01T02:00:00+00:00", title: "Mũi theo lịch cơ sở tiêm",
      provider: "Cơ sở tiêm", clinician: "", notes: "", next_due_at: null,
      details: { vaccine: "Theo phiếu hẹn", dose: "1", reaction: null }, documents: []
    }])));
  });
  afterEach(() => { process.env = { ...originalEnvironment }; vi.unstubAllGlobals(); });

  it("rejects unauthenticated access", async () => {
    expect((await GET(new Request("https://embe.hieu.asia/api/baby/medical"))).status).toBe(401);
  });

  it("lists records without exposing server credentials", async () => {
    const response = await GET(new Request("https://embe.hieu.asia/api/baby/medical", { headers: { cookie: cookie() } }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.records[0]).toMatchObject({ kind: "vaccination", status: "planned" });
    expect(JSON.stringify(payload)).not.toContain("server-only-key");
  });

  it("saves a clinician-led vaccination plan", async () => {
    const response = await POST(new Request("https://embe.hieu.asia/api/baby/medical", {
      method: "POST", headers: { cookie: cookie(), origin: "https://embe.hieu.asia", "content-type": "application/json" },
      body: JSON.stringify({ kind: "vaccination", status: "planned", occurredAt: "2026-10-01T09:00:00+07:00",
        title: "Mũi theo lịch cơ sở tiêm", provider: "Cơ sở tiêm", clinician: "", notes: "",
        nextDueAt: null, details: { vaccine: "Theo phiếu hẹn", dose: "1", reaction: null } })
    }));
    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("embe_save_baby_medical_record"), expect.objectContaining({ method: "POST" }));
  });

  it("rejects arbitrary nested medical data", async () => {
    const response = await POST(new Request("https://embe.hieu.asia/api/baby/medical", {
      method: "POST", headers: { cookie: cookie(), origin: "https://embe.hieu.asia", "content-type": "application/json" },
      body: JSON.stringify({ kind: "vaccination", status: "planned", occurredAt: "2026-10-01T09:00:00+07:00",
        title: "Mũi", provider: "", clinician: "", notes: "", nextDueAt: null,
        details: { vaccine: "A", dose: "1", reaction: null, secret: "not allowed" } })
    }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
