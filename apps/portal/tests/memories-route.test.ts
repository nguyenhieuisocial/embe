import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/media", () => ({
  getMediaMemories: vi.fn(async () => [])
}));

import { GET } from "../src/app/api/memories/route";
import { getMediaMemories } from "../src/lib/media";
import { createSessionCookie } from "../src/lib/portal-auth";

const SECRET = "memories-route-session-secret";

describe("private paginated memories", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.EMBE_PORTAL_SESSION_SECRET;
  });

  it("rejects direct access without the family session", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = SECRET;
    const response = await GET(new Request("https://embe.hieu.asia/api/memories"));
    expect(response.status).toBe(401);
    expect(getMediaMemories).not.toHaveBeenCalled();
  });

  it("passes bounded pagination to the private read model", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = SECRET;
    const request = new Request("https://embe.hieu.asia/api/memories?offset=48&limit=24", {
      headers: { cookie: `embe_session=${createSessionCookie(SECRET)}` }
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getMediaMemories).toHaveBeenCalledWith({ limit: 24, offset: 48 });
  });
});
