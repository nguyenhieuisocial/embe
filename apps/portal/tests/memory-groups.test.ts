import { describe, expect, it } from "vitest";

import { groupByDay, groupByPlace, groupIntoTrips } from "../src/lib/memory-groups";
import type { MediaMemory } from "../src/lib/media";

function memory(id: string, eventAt: string, city: string | null, region: string | null): MediaMemory {
  return {
    id,
    eventAt,
    title: `Kỷ niệm ${id}`,
    caption: "Gia đình bên nhau",
    mimeType: "image/webp",
    width: 1200,
    height: 900,
    placeCity: city,
    placeRegion: region,
    placeCountry: city ? "Việt Nam" : null,
    albumKey: "gia-dinh",
    albumTitle: "Khoảnh khắc gia đình",
    albumOrder: 90,
    reactions: {}
  };
}

const memories = [
  memory("1", "2026-08-30T10:00:00Z", "Đà Lạt", "Lâm Đồng"),
  memory("2", "2026-08-29T10:00:00Z", "Đà Lạt", "Lâm Đồng"),
  memory("3", "2026-07-10T10:00:00Z", null, null)
];

describe("memory explorer grouping", () => {
  it("groups the timeline by local family day", () => {
    expect(groupByDay(memories).map((group) => [group.key, group.memories.length]))
      .toEqual([["2026-08-30", 1], ["2026-08-29", 1], ["2026-07-10", 1]]);
  });

  it("groups a journey by place and month", () => {
    expect(groupIntoTrips(memories).map((trip) => [trip.title, trip.memories.length]))
      .toEqual([["Đà Lạt · tháng 8 năm 2026", 2], ["Những ngày gần nhà · tháng 7 năm 2026", 1]]);
  });

  it("groups the map by coarse province without requiring GPS", () => {
    expect(groupByPlace(memories).map((place) => [place.region, place.memories.length]))
      .toEqual([["Lâm Đồng", 2]]);
  });
});
