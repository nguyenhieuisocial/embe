import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH, POST } from "../src/app/api/baby/care/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };
const cookie = () => `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`;
const headers = () => ({ cookie: cookie(), origin: "https://embe.hieu.asia", "content-type": "application/json" });

const row = {
  id: "2e39dad3-c419-458d-beba-9c2063289792", kind: "feeding", occurred_at: "2026-09-01T01:00:00+00:00",
  ended_at: null, caregiver: "mother", details: { mode: "breast", side: "left" },
  sync_status: "pending", babybuddy_id: null
};

describe("private baby care endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([row])));
  });
  afterEach(() => { process.env = { ...originalEnvironment }; vi.unstubAllGlobals(); });

  it("rejects unauthenticated reads", async () => {
    expect((await GET(new Request("https://embe.hieu.asia/api/baby/care?day=2026-09-01"))).status).toBe(401);
  });

  it("creates a one-hand feeding timer with bounded details", async () => {
    const response = await POST(new Request("https://embe.hieu.asia/api/baby/care", {
      method: "POST", headers: headers(), body: JSON.stringify({
        idempotencyKey: "9f7ca4cf-55d2-4bd1-bf07-b72fbc4186f7", kind: "feeding",
        occurredAt: "2026-09-01T08:00:00+07:00", caregiver: "mother",
        details: { mode: "breast", side: "left" }
      })
    }));
    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("embe_create_baby_care_event"), expect.objectContaining({ method: "POST" }));
  });

  it("ends a running event without rewriting its start", async () => {
    const response = await PATCH(new Request("https://embe.hieu.asia/api/baby/care", {
      method: "PATCH", headers: headers(), body: JSON.stringify({
        id: row.id, endedAt: "2026-09-01T08:25:00+07:00"
      })
    }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("embe_end_baby_care_event"), expect.objectContaining({ method: "POST" }));
  });

  it("rejects malformed diaper and temperature data", async () => {
    const diaper = await POST(new Request("https://embe.hieu.asia/api/baby/care", {
      method: "POST", headers: headers(), body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(), kind: "diaper", occurredAt: "2026-09-01T08:00:00+07:00",
        caregiver: "father", details: { wet: false, solid: false }
      })
    }));
    const temperature = await POST(new Request("https://embe.hieu.asia/api/baby/care", {
      method: "POST", headers: headers(), body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(), kind: "temperature", occurredAt: "2026-09-01T08:00:00+07:00",
        caregiver: "mother", details: { temperatureC: 50 }
      })
    }));
    expect(diaper.status).toBe(400);
    expect(temperature.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
