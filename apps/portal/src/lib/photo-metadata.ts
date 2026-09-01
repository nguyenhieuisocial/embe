import { parse } from "exifr";

export type PhotoMetadata = {
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
};

function usableDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) && date.getTime() <= Date.now() + 86_400_000 ? date : null;
}

function coordinate(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? Math.round(value * 1_000_000) / 1_000_000
    : null;
}

function place(parts: unknown[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim()).filter((part, index, all) => all.indexOf(part) === index).join(", ").slice(0, 120);
}

export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const fallback = usableDate(file.lastModified) ?? new Date();
  try {
    const data = await parse(file, [
      "DateTimeOriginal", "CreateDate", "ModifyDate", "latitude", "longitude",
      "City", "State", "Country"
    ]) as Record<string, unknown> | undefined;
    const latitude = coordinate(data?.latitude, -90, 90);
    const longitude = coordinate(data?.longitude, -180, 180);
    return {
      capturedAt: (usableDate(data?.DateTimeOriginal) ?? usableDate(data?.CreateDate) ?? fallback).toISOString(),
      latitude: latitude != null && longitude != null ? latitude : null,
      longitude: latitude != null && longitude != null ? longitude : null,
      locationName: place([data?.City, data?.State, data?.Country])
    };
  } catch {
    return { capturedAt: fallback.toISOString(), latitude: null, longitude: null, locationName: "" };
  }
}

export function toLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
