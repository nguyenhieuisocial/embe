import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { GET, PATCH, POST } from "../src/app/api/pregnancy/symptoms/route";

const originalEnvironment = { ...process.env };
const entry = {
  id: "11111111-1111-4111-8111-111111111111",
  occurred_at: "2026-09-02T01:30:00.000Z",
  symptoms: ["bleeding"], severity: "moderate", status: "tracking",
  mood: "mixed", worry: "some", mental_note: "Hơi lo.", notes: "Ra máu ít.",
  created_at: "2026-09-02T01:31:00.000Z"
};

function request(method: string, body?: unknown, authenticated = true, origin = "https://embe.hieu.asia"): Request {
  return new Request("https://embe.hieu.asia/api/pregnancy/symptoms", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(method === "GET" ? {} : { origin }),
      ...(authenticated ? { cookie: `embe_session=${createSessionCookie("server-secret")}` } : {})
    }
  });
}

describe("private pregnancy symptom journal API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    rpc.mockReset();
  });

  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("requires the family session for reads and writes", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    expect((await POST(request("POST", { symptoms: ["bleeding"] }, false))).status).toBe(401);
    expect((await PATCH(request("PATCH", { id: entry.id, status: "resolved" }, false))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects cross-site writes and out-of-contract health data", async () => {
    const foreign = await POST(request("POST", {
      occurredAt: "2026-09-02T01:30:00.000Z", symptoms: ["bleeding"], severity: "moderate",
      status: "tracking", mood: null, worry: null, mentalNote: "", notes: ""
    }, true, "https://attacker.example"));
    const invalid = await POST(request("POST", {
      occurredAt: "2026-09-02T01:30:00.000Z", symptoms: ["diagnosed_condition"], severity: "10",
      status: "tracking", mood: null, worry: null, mentalNote: "", notes: "", diagnosis: "x"
    }));
    expect([foreign.status, invalid.status]).toEqual([403, 400]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects ambiguous local timestamps", async () => {
    const response = await POST(request("POST", {
      occurredAt: "2026-09-02 01:30", symptoms: ["bleeding"], severity: "moderate",
      status: "tracking", mood: null, worry: null, mentalNote: "", notes: ""
    }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a bounded saved history without caching it", async () => {
    rpc.mockResolvedValueOnce({ data: [entry], error: null });
    const response = await GET(new Request("https://embe.hieu.asia/api/pregnancy/symptoms?limit=20", {
      headers: { cookie: `embe_session=${createSessionCookie("server-secret")}` }
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ history: [{
      id: entry.id, occurredAt: entry.occurred_at, symptoms: ["bleeding"], severity: "moderate",
      status: "tracking", mood: "mixed", worry: "some", mentalNote: "Hơi lo.", notes: "Ra máu ít.",
      createdAt: entry.created_at
    }] });
    expect(rpc).toHaveBeenCalledWith("embe_get_pregnancy_symptom_history", { p_limit: 20 });
  });

  it("saves a bounded symptom and mental-health check-in through one RPC", async () => {
    rpc.mockResolvedValueOnce({ data: entry, error: null });
    const response = await POST(request("POST", {
      occurredAt: entry.occurred_at, symptoms: ["bleeding"], severity: "moderate", status: "tracking",
      mood: "mixed", worry: "some", mentalNote: "Hơi lo.", notes: "Ra máu ít."
    }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("embe_save_pregnancy_symptom_entry", {
      p_occurred_at: entry.occurred_at, p_symptoms: ["bleeding"], p_severity: "moderate",
      p_status: "tracking", p_mood: "mixed", p_worry: "some", p_mental_note: "Hơi lo.", p_notes: "Ra máu ít."
    });
    expect(JSON.stringify(await response.json())).not.toContain("server-only");
  });

  it("marks one tracking entry resolved through an exact PATCH contract", async () => {
    rpc.mockResolvedValueOnce({ data: { ...entry, status: "resolved" }, error: null });
    const response = await PATCH(request("PATCH", { id: entry.id, status: "resolved" }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("embe_resolve_pregnancy_symptom_entry", { p_id: entry.id });
    await expect(response.json()).resolves.toMatchObject({ entry: { id: entry.id, status: "resolved" } });
  });

  it("rejects invalid ids, extra PATCH fields and cross-site updates", async () => {
    const invalid = await PATCH(request("PATCH", { id: "not-a-uuid", status: "resolved" }));
    const extra = await PATCH(request("PATCH", { id: entry.id, status: "resolved", notes: "changed" }));
    const foreign = await PATCH(request("PATCH", { id: entry.id, status: "resolved" }, true, "https://attacker.example"));
    expect([invalid.status, extra.status, foreign.status]).toEqual([400, 400, 403]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when storage returns malformed private data", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...entry, severity: "critical" }], error: null });
    expect((await GET(request("GET"))).status).toBe(503);
  });
});
