import { afterEach, describe, expect, it, vi } from "vitest";

const ID = "11111111-1111-4111-8111-111111111111";
const { getMediaMemory } = vi.hoisted(() => ({
  getMediaMemory: vi.fn(async () => ({ id: ID, title: "Ngày vui" }))
}));

vi.mock("../src/lib/media", () => ({ getMediaMemory }));

import { POST } from "../src/app/api/share/media/[id]/route";
import { createSessionCookie } from "../src/lib/portal-auth";

describe("create temporary image share link", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBE_PORTAL_SESSION_SECRET;
  });

  it("requires the private family session", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    const response = await POST(new Request(`https://embe.hieu.asia/api/share/media/${ID}`, {
      method: "POST", headers: { origin: "https://embe.hieu.asia" }
    }), { params: Promise.resolve({ id: ID }) });
    expect(response.status).toBe(401);
  });

  it("returns only a same-site, expiring viewer link", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "server-secret";
    const session = createSessionCookie("server-secret", new Date(), "11111111-1111-4111-8111-111111111111");
    const response = await POST(new Request(`https://embe.hieu.asia/api/share/media/${ID}`, {
      method: "POST",
      headers: { cookie: `embe_session=${session}`, origin: "https://embe.hieu.asia" }
    }), { params: Promise.resolve({ id: ID }) });
    const body = await response.json() as { path: string; expiresAt: string };

    expect(response.status).toBe(201);
    expect(body.path).toMatch(/^\/chia-se\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(body)).not.toContain("supabase");
    expect(JSON.stringify(body)).not.toContain("immich");
  });
});
