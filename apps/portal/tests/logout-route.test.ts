import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../src/app/api/auth/logout/route";
import { createSessionCookie } from "../src/lib/portal-auth";

const originalEnvironment = { ...process.env };
const id = "11111111-1111-4111-8111-111111111111";

function logoutRequest(origin = "https://embe.hieu.asia"): Request {
  return new Request("https://embe.hieu.asia/api/auth/logout", { method: "POST", headers: {
    origin, cookie: `embe_session=${createSessionCookie("server-secret", new Date(), id)}`
  } });
}

describe("family logout endpoint", () => {
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...originalEnvironment }; });
  it("clears the private session and returns to login", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(1)));
    const response = await POST(logoutRequest());
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://embe.hieu.asia/login");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(cookie).toContain("embe_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("revokes the current server-side session before clearing the cookie", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    const fetchMock = vi.fn(async () => Response.json(1));
    vi.stubGlobal("fetch", fetchMock);
    await POST(logoutRequest());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("embe_revoke_portal_sessions"), expect.objectContaining({
      body: JSON.stringify({ p_current_id: id, p_target_id: id, p_all: false })
    }));
  });

  it("rejects cross-origin logout without touching the server session", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(logoutRequest("https://attacker.example"));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the cookie when server-side revocation fails", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "down" }, { status: 503 })));
    const response = await POST(logoutRequest());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
