import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/tasks/[id]/calendar/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };

function request(day = "2026-09-03", authenticated = true): Request {
  return new Request(`https://embe.hieu.asia/api/tasks/12/calendar?day=${day}`, {
    headers: authenticated ? { cookie: `embe_session=${createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111")}` } : {}
  });
}

describe("private task calendar download", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{
      id: "12", occurrence_on: "2026-09-03", starts_on: "2026-09-03",
      title: "Khám thai", note: "Mang kết quả", owner_role: "family",
      category: "appointment", link_target: "pregnancy", due_time: "09:30",
      repeat_rule: "none", completed: false
    }])));
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("requires the family session and a valid occurrence", async () => {
    expect((await GET(request("2026-09-03", false), { params: Promise.resolve({ id: "12" }) })).status).toBe(401);
    expect((await GET(request("bad"), { params: Promise.resolve({ id: "12" }) })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("downloads only an appointment occurrence without exposing provider data", async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: "12" }) });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("2026-09-03-kham-thai.ics");
    expect(body).toContain("SUMMARY:Khám thai");
    expect(body).not.toContain("server-key");
  });
});
