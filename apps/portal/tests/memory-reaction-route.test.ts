import { createSessionCookie } from "../src/lib/portal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { POST } from "../src/app/api/memories/[id]/reactions/route";

const originalEnvironment = { ...process.env };
const id = "11111111-1111-4111-8111-111111111111";

describe("private memory reactions", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    rpc.mockReset();
  });
  afterEach(() => { process.env = { ...originalEnvironment }; });

  it("stores one bounded private family reaction", async () => {
    rpc.mockResolvedValueOnce({ data: { heart: 1 }, error: null });
    const request = new Request(`https://embe.hieu.asia/api/memories/${id}/reactions`, {
      method: "POST",
      headers: {
        cookie: `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`,
        "content-type": "application/json",
        origin: "https://embe.hieu.asia"
      },
      body: JSON.stringify({ authorRole: "mother", emoji: "heart" })
    });
    const response = await POST(request, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reactions: { heart: 1 } });
  });

  it("rejects unknown reactions before storage", async () => {
    const request = new Request(`https://embe.hieu.asia/api/memories/${id}/reactions`, {
      method: "POST",
      headers: {
        cookie: `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}`,
        "content-type": "application/json",
        origin: "https://embe.hieu.asia"
      },
      body: JSON.stringify({ authorRole: "mother", emoji: "public-like" })
    });
    expect((await POST(request, { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
