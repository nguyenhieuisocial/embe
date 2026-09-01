import { afterEach, describe, expect, it, vi } from "vitest";

const ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../src/lib/media", () => ({
  getMediaLocator: vi.fn(async () => ({
    objectPath: `assets/${ID}/${"a".repeat(64)}.webp`,
    mimeType: "image/webp",
    checksum: "a".repeat(64)
  }))
}));

import { GET } from "../src/app/api/public/media/[token]/route";
import { createMediaShareToken } from "../src/lib/share-token";

describe("public temporary media proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBE_PORTAL_SESSION_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("serves the private object only through an intact temporary token", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "temporary-share-secret";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    const token = createMediaShareToken(ID);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { "content-type": "image/webp", "content-length": "3" }
    }));

    const response = await GET(new Request(`https://embe.hieu.asia/api/public/media/${token}`), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(fetchMock.mock.calls[0][0].toString()).not.toContain("server-only-secret");
  });

  it("does not touch storage for a changed token", async () => {
    process.env.EMBE_PORTAL_SESSION_SECRET = "temporary-share-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await GET(new Request("https://embe.hieu.asia/api/public/media/nope.token"), { params: Promise.resolve({ token: "nope.token" }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
