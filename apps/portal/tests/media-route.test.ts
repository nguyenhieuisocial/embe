import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/media", () => ({
  getMediaLocator: vi.fn(async () => ({
    objectPath: `assets/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}.webp`,
    mimeType: "image/webp",
    checksum: "a".repeat(64)
  }))
}));

import { GET } from "../src/app/api/media/[id]/route";

describe("private media proxy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads through authenticated Supabase Storage without exposing the key", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([82, 73, 70, 70]), {
      status: 200,
      headers: { "content-type": "image/webp", "content-length": "4" }
    }));
    const response = await GET(new Request("https://embe.hieu.asia/api/media/id"), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(fetchMock.mock.calls[0][0].toString()).toContain("/storage/v1/object/authenticated/embe-portal-previews/");
    expect(fetchMock.mock.calls[0][0].toString()).not.toContain("server-only-secret");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toContain("server-only-secret");
  });

  it("rejects a mismatched storage content type", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("html", { status: 200, headers: { "content-type": "text/html" } }));
    const response = await GET(new Request("https://embe.hieu.asia/api/media/id"), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(404);
  });
});
