import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { GET, POST } from "../src/app/api/pregnancy/mental-health/route";

const originalEnvironment = { ...process.env };
const sessionId = "11111111-1111-4111-8111-111111111111";
const stored = {
  id: "22222222-2222-4222-8222-222222222222",
  occurred_at: "2026-09-02T01:30:00.000Z",
  mood: 4,
  anxiety: 2,
  note: "Hôm nay được nghỉ ngơi.",
  phq2_interest: null,
  phq2_depressed: null,
  gad2_nervous: null,
  gad2_control: null,
  created_at: "2026-09-02T01:31:00.000Z"
};

function cookie(): string {
  return `embe_session=${createSessionCookie("server-secret", new Date(), sessionId)}`;
}

function request(method: string, body?: unknown, authenticated = true, origin = "https://embe.hieu.asia") {
  return new Request("https://embe.hieu.asia/api/pregnancy/mental-health", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(method === "GET" ? {} : { origin }),
      ...(authenticated ? { cookie: cookie() } : {})
    }
  });
}

describe("private pregnancy mental-health API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    rpc.mockReset();
  });

  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("requires a family session and same-origin writes", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    expect((await POST(request("POST", { mood: 4, anxiety: 2 }, false))).status).toBe(401);
    expect((await POST(request("POST", { mood: 4, anxiety: 2 }, true, "https://attacker.example"))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads a bounded 28-day history without caching", async () => {
    rpc.mockResolvedValueOnce({ data: [stored], error: null });
    const response = await GET(new Request(
      "https://embe.hieu.asia/api/pregnancy/mental-health?days=28",
      { headers: { cookie: cookie() } }
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ history: [{
      id: stored.id,
      occurredAt: stored.occurred_at,
      mood: 4,
      anxiety: 2,
      note: stored.note,
      phq2Interest: null,
      phq2Depressed: null,
      gad2Nervous: null,
      gad2Control: null,
      createdAt: stored.created_at
    }] });
    expect(rpc).toHaveBeenCalledWith("embe_get_pregnancy_mental_health_history", { p_days: 28 });
  });

  it("saves a check-in without symptoms or screening answers", async () => {
    rpc.mockResolvedValueOnce({ data: stored, error: null });
    const response = await POST(request("POST", {
      occurredAt: stored.occurred_at,
      mood: 4,
      anxiety: 2,
      note: stored.note,
      phq2Interest: null,
      phq2Depressed: null,
      gad2Nervous: null,
      gad2Control: null
    }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("embe_save_pregnancy_mental_health_checkin", {
      p_occurred_at: stored.occurred_at,
      p_mood: 4,
      p_anxiety: 2,
      p_note: stored.note,
      p_phq2_interest: null,
      p_phq2_depressed: null,
      p_gad2_nervous: null,
      p_gad2_control: null
    });
  });

  it("accepts complete optional PHQ-2 and GAD-2 pairs", async () => {
    rpc.mockResolvedValueOnce({ data: { ...stored, phq2_interest: 1, phq2_depressed: 2, gad2_nervous: 0, gad2_control: 1 }, error: null });
    expect((await POST(request("POST", {
      occurredAt: stored.occurred_at, mood: 3, anxiety: 3, note: "",
      phq2Interest: 1, phq2Depressed: 2, gad2Nervous: 0, gad2Control: 1
    }))).status).toBe(201);
  });

  it("rejects partial screening, extra fields, oversized text and invalid windows", async () => {
    const partial = await POST(request("POST", {
      occurredAt: stored.occurred_at, mood: 3, anxiety: 2, note: "", phq2Interest: 1,
      phq2Depressed: null, gad2Nervous: null, gad2Control: null
    }));
    const extra = await POST(request("POST", {
      occurredAt: stored.occurred_at, mood: 3, anxiety: 2, note: "", diagnosis: "x",
      phq2Interest: null, phq2Depressed: null, gad2Nervous: null, gad2Control: null
    }));
    const long = await POST(request("POST", {
      occurredAt: stored.occurred_at, mood: 3, anxiety: 2, note: "x".repeat(501),
      phq2Interest: null, phq2Depressed: null, gad2Nervous: null, gad2Control: null
    }));
    const invalidWindow = await GET(new Request(
      "https://embe.hieu.asia/api/pregnancy/mental-health?days=90",
      { headers: { cookie: cookie() } }
    ));
    expect([partial.status, extra.status, long.status, invalidWindow.status]).toEqual([400, 400, 400, 400]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("enforces the request byte cap before parsing", async () => {
    const response = await POST(request("POST", {
      occurredAt: stored.occurred_at, mood: 3, anxiety: 2, note: "x".repeat(3000),
      phq2Interest: null, phq2Depressed: null, gad2Nervous: null, gad2Control: null
    }));
    expect(response.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when storage returns malformed private data", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...stored, occurred_at: "not-a-date" }], error: null });
    expect((await GET(request("GET"))).status).toBe(503);
  });
});
