import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "../src/app/api/birth-prep/bag/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };
const cookie = () => `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`;

describe("hospital bag endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("keeps bag contents private", async () => {
    expect((await GET(new Request("https://embe.hieu.asia/api/birth-prep/bag"))).status).toBe(401);
  });

  it("rejects unknown checklist identifiers", async () => {
    const response = await PATCH(new Request("https://embe.hieu.asia/api/birth-prep/bag", {
      method: "PATCH",
      headers: { cookie: cookie(), origin: "https://embe.hieu.asia", "content-type": "application/json" },
      body: JSON.stringify({ completed: ["unknown-item"] })
    }));
    expect(response.status).toBe(400);
  });

  it("returns the persisted shared checklist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(["identity", "mother-clothes"])));
    const response = await GET(new Request("https://embe.hieu.asia/api/birth-prep/bag", { headers: { cookie: cookie() } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ completed: ["identity", "mother-clothes"] });
  });
});
