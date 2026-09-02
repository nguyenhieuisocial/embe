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
      headers: { cookie: `embe_session=${createSessionCookie(SECRET, new Date(), "11111111-1111-4111-8111-111111111111")}` }
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getMediaMemories).toHaveBeenCalledWith({ limit: 24, offset: 48 });
  });

  it("filters one Vietnamese calendar day and rejects malformed dates", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = SECRET;
    const cookie = `embe_session=${createSessionCookie(SECRET, new Date(), "11111111-1111-4111-8111-111111111111")}`;
    const response = await GET(new Request("https://embe.hieu.asia/api/memories?date=2026-08-30", {
      headers: { cookie }
    }));

    expect(response.status).toBe(200);
    expect(getMediaMemories).toHaveBeenCalledWith({
      from: "2026-08-30T00:00:00+07:00",
      limit: 24,
      offset: 0,
      to: "2026-08-31T00:00:00+07:00"
    });

    const invalid = await GET(new Request("https://embe.hieu.asia/api/memories?date=2026-02-31", {
      headers: { cookie }
    }));
    expect(invalid.status).toBe(400);
  });

  it("passes a validated folder album filter", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = SECRET;
    const cookie = `embe_session=${createSessionCookie(SECRET, new Date(), "11111111-1111-4111-8111-111111111111")}`;
    const response = await GET(new Request("https://embe.hieu.asia/api/memories?album=da-lat-2025", { headers: { cookie } }));

    expect(response.status).toBe(200);
    expect(getMediaMemories).toHaveBeenCalledWith({ album: "da-lat-2025", limit: 24, offset: 0 });
  });
});
