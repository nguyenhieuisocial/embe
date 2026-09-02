import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { GET, POST } from "../src/app/api/pregnancy/fetal-movements/route";

const originalEnvironment = { ...process.env };
const session = {
  id: "11111111-1111-4111-8111-111111111111",
  started_at: "2026-09-02T08:00:00.000Z",
  ended_at: "2026-09-02T08:24:00.000Z",
  movement_count: 7,
  note: "Nhịp quen thuộc sau bữa sáng",
  created_at: "2026-09-02T08:00:00.000Z"
};

function request(method: string, body?: unknown, authenticated = true, origin = "https://embe.hieu.asia") {
  return new Request("https://embe.hieu.asia/api/pregnancy/fetal-movements", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(method === "GET" ? {} : { origin }),
      ...(authenticated ? { cookie: `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}` } : {})
    }
  });
}

describe("private fetal movement sessions API", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    rpc.mockReset();
  });
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("requires a family session", async () => {
    expect((await GET(request("GET", undefined, false))).status).toBe(401);
    expect((await POST(request("POST", { action: "start", id: session.id, at: session.started_at }, false))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lists bounded, validated movement sessions", async () => {
    rpc.mockResolvedValueOnce({ data: [session], error: null });
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sessions: [{
      id: session.id, startedAt: session.started_at, endedAt: session.ended_at,
      movementCount: 7, note: session.note, createdAt: session.created_at
    }] });
    expect(rpc).toHaveBeenCalledWith("embe_list_fetal_movement_sessions", { p_limit: 20 });
  });

  it.each([
    ["start", { action: "start", id: session.id, at: session.started_at }, "embe_start_fetal_movement_session"],
    ["movement", { action: "movement", id: session.id, at: "2026-09-02T08:05:00.000Z" }, "embe_record_fetal_movement"],
    ["finish", { action: "finish", id: session.id, at: session.ended_at, note: session.note }, "embe_finish_fetal_movement_session"]
  ])("supports the %s action with an exact contract", async (_label, body, functionName) => {
    rpc.mockResolvedValueOnce({ data: session, error: null });
    const response = await POST(request("POST", body));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(functionName, expect.any(Object));
  });

  it("rejects cross-site, extra and invalid data", async () => {
    const foreign = await POST(request("POST", { action: "start", id: session.id, at: session.started_at }, true, "https://attacker.example"));
    const extra = await POST(request("POST", { action: "movement", id: session.id, at: session.started_at, count: 10 }));
    const invalid = await POST(request("POST", { action: "finish", id: "bad", at: "today", note: "x" }));
    expect([foreign.status, extra.status, invalid.status]).toEqual([403, 400, 400]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
