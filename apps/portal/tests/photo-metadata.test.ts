import { afterEach, describe, expect, it, vi } from "vitest";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("exifr", () => ({ parse }));

import { readPhotoMetadata } from "../src/lib/photo-metadata";

describe("photo metadata", () => {
  afterEach(() => parse.mockReset());

  it("prefers the original EXIF date and GPS coordinates", async () => {
    parse.mockResolvedValue({
      DateTimeOriginal: new Date("2025-04-30T03:15:00.000Z"),
      latitude: 10.7769,
      longitude: 106.7009,
      City: "Thành phố Hồ Chí Minh"
    });
    const file = new File(["photo"], "IMG.JPG", { type: "image/jpeg", lastModified: Date.parse("2026-09-01T01:00:00Z") });
    await expect(readPhotoMetadata(file)).resolves.toEqual({
      capturedAt: "2025-04-30T03:15:00.000Z",
      latitude: 10.7769,
      longitude: 106.7009,
      locationName: "Thành phố Hồ Chí Minh"
    });
  });

  it("falls back safely when a file has no readable EXIF", async () => {
    parse.mockRejectedValue(new Error("unsupported"));
    const file = new File(["photo"], "scan.png", { type: "image/png", lastModified: Date.parse("2026-08-20T02:00:00Z") });
    await expect(readPhotoMetadata(file)).resolves.toEqual({
      capturedAt: "2026-08-20T02:00:00.000Z", latitude: null, longitude: null, locationName: ""
    });
  });
});
