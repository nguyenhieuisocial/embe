import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie } from "../src/lib/portal-auth";
import { GET, POST } from "../src/app/api/inventory/route";

const originalEnvironment = { ...process.env };

function sessionCookie(): string {
  return `embe_session=${createSessionCookie("server-secret")}`;
}

describe("private inventory endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects inventory reads without a family session", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await GET(new Request("https://embe.hieu.asia/api/inventory"));

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a normalized private stock snapshot and queue count", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { source_product_id: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", min_quantity: 10, needs_restock: true }
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pending: 1, processing: 0, dead_letters: 0 }), { status: 200 }))
    );

    const response = await GET(new Request("https://embe.hieu.asia/api/inventory", {
      headers: { cookie: sessionCookie() }
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ productId: 12, name: "Bỉm sơ sinh", quantity: 7, unit: "cái", minQuantity: 10, needsRestock: true }],
      pending: 1
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("accepts one bounded idempotent adjustment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify("accepted"), { status: 200 })));
    const response = await POST(new Request("https://embe.hieu.asia/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie() },
      body: JSON.stringify({
        action: "set_amount",
        productId: 12,
        amount: 6,
        idempotencyKey: "11111111-1111-4111-8111-111111111111"
      })
    }));

    expect(response.status).toBe(202);
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_submit_inventory_action",
      expect.objectContaining({
        body: JSON.stringify({
          p_idempotency_key: "11111111-1111-4111-8111-111111111111",
          p_action_type: "set_amount",
          p_product_id: 12,
          p_name: null,
          p_category: null,
          p_unit: null,
          p_amount: 6,
          p_min_amount: null
        })
      })
    );
  });

  it("rejects malformed create actions before they reach storage", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await POST(new Request("https://embe.hieu.asia/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie() },
      body: JSON.stringify({ action: "create", name: "", unit: "unknown", amount: -2, idempotencyKey: "bad" })
    }));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects control characters in an inventory name", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await POST(new Request("https://embe.hieu.asia/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie() },
      body: JSON.stringify({
        action: "create",
        name: "Bỉm\nẩn",
        category: "baby",
        unit: "cái",
        amount: 0,
        minAmount: 1,
        idempotencyKey: "11111111-1111-4111-8111-111111111111"
      })
    }));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
