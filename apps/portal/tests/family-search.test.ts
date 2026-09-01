import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeFamilySearch, searchFamilyContent } from "../src/lib/family-search";

describe("private family search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes human search text without allowing PostgREST syntax", () => {
    expect(normalizeFamilySearch("  Đà   Lạt (2025), ảnh đẹp!  ")).toBe("Đà Lạt 2025 ảnh đẹp");
    expect(normalizeFamilySearch("a")).toBe("");
  });

  it("searches only curated memories and journal fields with the server key", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: "11111111-1111-4111-8111-111111111111", event_at: "2025-12-23T10:00:00Z",
        title: "Đà Lạt", caption: "Chuyến đi của nhà mình", mime_type: "image/webp",
        width: 1200, height: 900, place_city: "Đà Lạt", place_region: "Lâm Đồng",
        place_country: "Việt Nam", album_key: "da-lat-2025", album_title: "Đà Lạt 2025",
        album_order: 50, reactions: {}
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: "memo-1", event_at: "2025-12-23T11:00:00Z", portal_event_type: "journal",
        title: "Ngày ở Đà Lạt", caption: "Mình đi dạo", album_cover_url: null
      }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchFamilyContent("Đà Lạt");

    expect(result.memories).toHaveLength(1);
    expect(result.journal).toHaveLength(1);
    expect(fetchMock.mock.calls.every((call) => call[1].headers.apikey === "server-secret")).toBe(true);
    expect(fetchMock.mock.calls.map((call) => call[0].toString()).join(" ")).not.toContain("server-secret");
  });
});
