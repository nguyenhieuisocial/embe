import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET } from "../src/app/api/auth/sessions/route";
import SessionSettings from "../src/components/session-settings";
import { createSessionCookie } from "../src/lib/portal-auth";

const id = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn();
const originalEnvironment = { ...process.env };
function request(method: string, body?: unknown) {
  const cookie = createSessionCookie("server-secret", new Date(), id);
  return new Request("https://embe.hieu.asia/api/auth/sessions", { method,
    headers: { cookie: `embe_session=${cookie}`, origin: "https://embe.hieu.asia", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("server-side login sessions", () => {
  beforeEach(() => { process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret"; process.env.SUPABASE_URL = "https://project.supabase.co"; process.env.SUPABASE_SECRET_KEY = "server-only"; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...originalEnvironment }; });

  it("lists named devices without any raw IP field", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{ id, device_name: "Safari trên iPhone", auth_method: "password", created_at: "2026-09-02T00:00:00Z", last_seen_at: "2026-09-02T01:00:00Z", current: true }]));
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toMatch(/ip_address|user_agent|203\.0\.113/);
  });

  it("revokes every session and clears the current HttpOnly cookie", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(2));
    const response = await DELETE(request("DELETE", { action: "all" }));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("embe_revoke_portal_sessions"), expect.objectContaining({ body: JSON.stringify({ p_current_id: id, p_target_id: null, p_all: true }) }));
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("revokes one other device without clearing the current cookie", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    fetchMock.mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(1));
    const response = await DELETE(request("DELETE", { action: "one", id: other }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("embe_revoke_portal_sessions"), expect.objectContaining({
      body: JSON.stringify({ p_current_id: id, p_target_id: other, p_all: false })
    }));
  });

  it("rejects an oversized revocation request", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(true));
    const response = await DELETE(request("DELETE", { action: "all", padding: "x".repeat(600) }));
    expect(response.status).toBe(413);
  });

  it("offers a one-hand logout-all action in settings", async () => {
    const uiFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "DELETE"
      ? Response.json({ revoked: 2 }) : Response.json({ sessions: [{ id, deviceName: "Safari trên iPhone", authMethod: "password", createdAt: "2026-09-02T00:00:00Z", lastSeenAt: "2026-09-02T01:00:00Z", current: true }] }));
    vi.stubGlobal("fetch", uiFetch);
    render(createElement(SessionSettings));
    expect(await screen.findByText(/Safari trên iPhone/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất tất cả" })).toBeInTheDocument();
  });
});
