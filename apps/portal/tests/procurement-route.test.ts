import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";
import { GET, PATCH } from "../src/app/api/procurement/route";

const originalEnvironment = { ...process.env };

function sessionCookie(): string {
  return `embe_session=${createSessionCookie("server-secret")}`;
}

describe("private procurement endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects reads without a family session", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await GET(new Request("https://embe.hieu.asia/api/procurement"));
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns only bounded proposal decision data", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: "11111111-1111-4111-8111-111111111111",
        product_name: "Bỉm sơ sinh", state: "DRAFT", packs: 2,
        required_units: 45, estimated_total_vnd: 780000,
        proposal_hash: "a".repeat(64), updated_at: "2026-08-31T00:00:00Z"
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pending: 1, processing: 0, dead_letters: 0 }), { status: 200 }))
    );

    const response = await GET(new Request("https://embe.hieu.asia/api/procurement", {
      headers: { cookie: sessionCookie() }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      proposals: [{
        id: "11111111-1111-4111-8111-111111111111", productName: "Bỉm sơ sinh",
        state: "DRAFT", packs: 2, requiredUnits: 45, estimatedTotalVnd: 780000,
        proposalHash: "a".repeat(64), updatedAt: "2026-08-31T00:00:00Z"
      }],
      pending: 1
    });
  });

  it("accepts a hash-locked human transition", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify("accepted"), { status: 200 })));
    const response = await PATCH(new Request("https://embe.hieu.asia/api/procurement", {
      method: "PATCH",
      headers: { cookie: sessionCookie(), "content-type": "application/json" },
      body: JSON.stringify({
        proposalId: "11111111-1111-4111-8111-111111111111",
        target: "REVIEWED",
        proposalHash: "a".repeat(64),
        idempotencyKey: "22222222-2222-4222-8222-222222222222"
      })
    }));

    expect(response.status).toBe(202);
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_submit_procurement_action",
      expect.objectContaining({ body: JSON.stringify({
        p_idempotency_key: "22222222-2222-4222-8222-222222222222",
        p_proposal_id: "11111111-1111-4111-8111-111111111111",
        p_target_state: "REVIEWED",
        p_expected_hash: "a".repeat(64)
      }) })
    );
  });

  it("rejects invalid state or stale-shaped hashes before storage", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await PATCH(new Request("https://embe.hieu.asia/api/procurement", {
      method: "PATCH",
      headers: { cookie: sessionCookie(), "content-type": "application/json" },
      body: JSON.stringify({ proposalId: "bad", target: "AUTO_ORDERED", proposalHash: "x", idempotencyKey: "bad" })
    }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
