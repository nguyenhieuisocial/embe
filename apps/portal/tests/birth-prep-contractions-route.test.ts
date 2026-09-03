import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/birth-prep/contractions/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };
const sessionCookie = () => `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`;
const headers = () => ({
  cookie: sessionCookie(),
  origin: "https://embe.hieu.asia",
  "content-type": "application/json"
});

describe("birth contraction endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("rejects unauthenticated history reads", async () => {
    expect((await GET(new Request("https://embe.hieu.asia/api/birth-prep/contractions"))).status).toBe(401);
  });

  it("does not acknowledge a contraction when storage failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "failed" }, { status: 500 })));
    const response = await POST(new Request("https://embe.hieu.asia/api/birth-prep/contractions", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        id: "9f7ca4cf-55d2-4bd1-bf07-b72fbc4186f7",
        action: "start",
        time: "2026-09-03T09:00:00+07:00"
      })
    }));

    expect(response.status).toBe(503);
  });

  it("acknowledges the contraction only after storage succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "saved" })));
    const response = await POST(new Request("https://embe.hieu.asia/api/birth-prep/contractions", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        id: "9f7ca4cf-55d2-4bd1-bf07-b72fbc4186f7",
        action: "start",
        time: "2026-09-03T09:00:00+07:00"
      })
    }));

    expect(response.status).toBe(202);
  });
});
