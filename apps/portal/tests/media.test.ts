import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMediaLocator, getMediaMemories, getMediaMemoryDates } from "../src/lib/media";

const ID = "11111111-1111-4111-8111-111111111111";

describe("private media read model", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns only valid curated memories without storage locators", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { id: ID, event_at: "2026-08-30T10:00:00Z", title: "Một ngày vui", caption: "Cả nhà bên nhau", mime_type: "image/webp", width: 1200, height: 900, place_city: "Đà Lạt", place_region: "Lâm Đồng", place_country: "Việt Nam" },
      { id: "invalid", event_at: "bad", title: "bad", caption: "bad", mime_type: "text/html" }
    ]), { status: 200 }));
    const result = await getMediaMemories();
    expect(result).toEqual([{ id: ID, eventAt: "2026-08-30T10:00:00Z", title: "Một ngày vui", caption: "Cả nhà bên nhau", mimeType: "image/webp", width: 1200, height: 900, placeCity: "Đà Lạt", placeRegion: "Lâm Đồng", placeCountry: "Việt Nam" }]);
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
