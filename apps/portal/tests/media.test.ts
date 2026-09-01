import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMediaAlbums, getMediaLocator, getMediaMemories, getMediaMemoryDates } from "../src/lib/media";

const ID = "11111111-1111-4111-8111-111111111111";

describe("private media read model", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns only valid curated memories without storage locators", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { id: ID, event_at: "2026-08-30T10:00:00Z", title: "Một ngày vui", caption: "Cả nhà bên nhau", mime_type: "image/webp", width: 1200, height: 900, place_city: "Đà Lạt", place_region: "Lâm Đồng", place_country: "Việt Nam", album_key: "da-lat-2025", album_title: "Đà Lạt · 23.12.2025", album_order: 50 },
      { id: "invalid", event_at: "bad", title: "bad", caption: "bad", mime_type: "text/html" }
    ]), { status: 200 }));
    const result = await getMediaMemories();
    expect(result).toEqual([{ id: ID, eventAt: "2026-08-30T10:00:00Z", title: "Một ngày vui", caption: "Cả nhà bên nhau", mimeType: "image/webp", width: 1200, height: 900, placeCity: "Đà Lạt", placeRegion: "Lâm Đồng", placeCountry: "Việt Nam", albumKey: "da-lat-2025", albumTitle: "Đà Lạt · 23.12.2025", albumOrder: 50, reactions: {}, editable: false }]);
    expect(fetchMock.mock.calls[0][0].toString()).toContain("embe_media_item");
    expect(fetchMock.mock.calls[0][0].toString()).not.toContain("object_path");
    expect(fetchMock.mock.calls[0][0].toString()).not.toContain("latitude");
  });

  it("supports bounded gallery pagination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    await getMediaMemories({ limit: 24, offset: 48 });
    const url = fetchMock.mock.calls[0][0].toString();
    expect(url).toContain("limit=24");
    expect(url).toContain("offset=48");
  });

  it("filters a gallery by a safe semantic album key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    await getMediaMemories({ album: "da-lat-2025", limit: 24 });
    expect(fetchMock.mock.calls[0][0].toString()).toContain("album_key=eq.da-lat-2025");
  });

  it("builds folder-aware album covers without exposing source paths", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([
      { id: ID, event_at: "2025-12-23T10:00:00Z", title: "Đà Lạt", caption: "Cùng nhau", mime_type: "image/webp", width: 1200, height: 900, place_city: "Đà Lạt", place_region: "Lâm Đồng", place_country: "Việt Nam", album_key: "da-lat-2025", album_title: "Đà Lạt · 23.12.2025", album_order: 50 },
      { id: "22222222-2222-4222-8222-222222222222", event_at: "2025-12-23T11:00:00Z", title: "Đà Lạt 2", caption: "Cùng nhau", mime_type: "image/webp", width: 900, height: 1200, place_city: "Đà Lạt", place_region: "Lâm Đồng", place_country: "Việt Nam", album_key: "da-lat-2025", album_title: "Đà Lạt · 23.12.2025", album_order: 50 }
    ]), { status: 200 }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("[]", { status: 200 }));

    const albums = await getMediaAlbums();
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({ key: "da-lat-2025", title: "Đà Lạt · 23.12.2025", count: 2 });
    expect(albums[0].covers).toHaveLength(2);
  });

  it("loads the date index for one calendar month without exposing media locators", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { event_at: "2026-08-30T10:00:00Z" },
      { event_at: "invalid" }
    ]), { status: 200 }));

    expect(await getMediaMemoryDates({
      from: "2026-08-01T00:00:00+07:00",
      to: "2026-09-01T00:00:00+07:00"
    })).toEqual(["2026-08-30T10:00:00Z"]);
    const url = fetchMock.mock.calls[0][0].toString();
    expect(url).toContain("select=event_at");
    expect(url).toContain("event_at=gte.");
    expect(url).toContain("event_at=lt.");
    expect(url).not.toContain("object_path");
  });

  it("validates the server-only locator contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{
      object_path: `assets/${ID}/${"a".repeat(64)}.webp`,
      mime_type: "image/webp",
      checksum_sha256: "a".repeat(64)
    }]), { status: 200 }));
    expect(await getMediaLocator(ID)).toEqual({ objectPath: `assets/${ID}/${"a".repeat(64)}.webp`, mimeType: "image/webp", checksum: "a".repeat(64) });
  });

  it("fails closed when server credentials are missing", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(await getMediaMemories()).toEqual([]);
    expect(await getMediaLocator(ID)).toBeNull();
  });
});
