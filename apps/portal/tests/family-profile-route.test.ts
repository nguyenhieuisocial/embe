import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "../src/app/api/family/profile/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };

function sessionCookie(): string {
  return `embe_session=${createSessionCookie("server-secret")}`;
}

function patchRequest(body: unknown, origin = "https://embe.hieu.asia"): Request {
  return new Request("https://embe.hieu.asia/api/family/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: sessionCookie(), origin },
    body: JSON.stringify(body)
  });
}

describe("private family profile endpoint", () => {
  beforeEach(() => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      mother_birth_date: "1995-04-12",
      father_birth_date: "1990-08-20"
    }))));
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.unstubAllGlobals();
  });

  it("does not expose birth dates without the family session", async () => {
    expect((await GET(new Request("https://embe.hieu.asia/api/family/profile"))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns and saves both parents through server-only RPCs", async () => {
    const read = await GET(new Request("https://embe.hieu.asia/api/family/profile", { headers: { cookie: sessionCookie() } }));
    expect(await read.json()).toEqual({ motherBirthDate: "1995-04-12", fatherBirthDate: "1990-08-20" });

    const save = await PATCH(patchRequest({ motherBirthDate: "1995-04-12", fatherBirthDate: "1990-08-20" }));
    expect(save.status).toBe(200);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://project.supabase.co/rest/v1/rpc/embe_save_family_profile",
      expect.objectContaining({ method: "POST", body: JSON.stringify({
        p_mother_birth_date: "1995-04-12", p_father_birth_date: "1990-08-20"
      }) })
    );
  });

  it("rejects future dates, extra fields and foreign origins", async () => {
    expect((await PATCH(patchRequest({ motherBirthDate: "2099-01-01", fatherBirthDate: null }))).status).toBe(400);
    expect((await PATCH(patchRequest({ motherBirthDate: null, fatherBirthDate: null, role: "admin" }))).status).toBe(400);
    expect((await PATCH(patchRequest({ motherBirthDate: null, fatherBirthDate: null }, "https://attacker.example"))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
