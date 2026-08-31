import type { MediaMemory } from "./media";

export type MemoryGroup = {
  key: string;
  title: string;
  subtitle: string;
  memories: MediaMemory[];
};

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric"
});

const DAY_LABEL = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "full",
  timeZone: "Asia/Ho_Chi_Minh"
});

const MONTH_LABEL = new Intl.DateTimeFormat("vi-VN", {
  month: "long",
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric"
});

function dateKey(value: string): string {
  return DAY_KEY.format(new Date(value));
}

function placeLabel(memory: MediaMemory): string {
  return memory.placeCity ?? memory.placeRegion ?? memory.placeCountry ?? "Những ngày gần nhà";
}

export function groupByDay(memories: MediaMemory[]): MemoryGroup[] {
  const groups = new Map<string, MediaMemory[]>();
  for (const memory of memories) {
    const key = dateKey(memory.eventAt);
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }
  return [...groups].map(([key, items]) => ({
    key,
    title: DAY_LABEL.format(new Date(items[0].eventAt)),
    subtitle: placeLabel(items[0]),
    memories: items
  }));
}

export function groupIntoTrips(memories: MediaMemory[]): MemoryGroup[] {
  const groups = new Map<string, MediaMemory[]>();
  for (const memory of memories) {
    const month = dateKey(memory.eventAt).slice(0, 7);
    const place = placeLabel(memory);
    const key = `${place.toLocaleLowerCase("vi-VN")}|${month}`;
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }
  return [...groups].map(([key, items]) => {
    const place = placeLabel(items[0]);
    return {
      key,
      title: `${place} · ${MONTH_LABEL.format(new Date(items[0].eventAt))}`,
      subtitle: `${items.length} khoảnh khắc`,
      memories: items
    };
  });
}

export function groupByPlace(memories: MediaMemory[]): Array<MemoryGroup & { region: string }> {
  const groups = new Map<string, MediaMemory[]>();
  for (const memory of memories) {
    const region = memory.placeRegion ?? memory.placeCity;
    if (region) groups.set(region, [...(groups.get(region) ?? []), memory]);
  }
  return [...groups].map(([region, items]) => ({
    key: region.toLocaleLowerCase("vi-VN"),
    region,
    title: items[0].placeCity ?? region,
    subtitle: `${items.length} khoảnh khắc`,
    memories: items
  }));
}

export function normalizePlace(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .replace(/\b(thanh pho|tinh|city|province)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
