export type MediaMemory = {
  id: string;
  eventAt: string;
  title: string;
  caption: string;
  mimeType: "image/jpeg" | "image/webp";
  width: number | null;
  height: number | null;
  placeCity: string | null;
  placeRegion: string | null;
  placeCountry: string | null;
  reactions: Partial<Record<"heart" | "love" | "laugh" | "moved", number>>;
};

export type MediaLocator = {
  objectPath: string;
  mimeType: "image/jpeg" | "image/webp";
  checksum: string;
};

const MEDIA_MIME = new Set(["image/jpeg", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_PATH = /^assets\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(jpg|webp)$/;

function credentials(): { baseUrl: string; secretKey: string } | null {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return null;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return { baseUrl: parsed.origin, secretKey };
  } catch {
    return null;
  }
}

function safeText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

export async function getMediaMemories(
  options: { from?: string; limit?: number; offset?: number; to?: string } = {}
): Promise<MediaMemory[]> {
  const config = credentials();
  if (!config) return [];
  const limit = Number.isInteger(options.limit) && options.limit! >= 1 && options.limit! <= 60
    ? options.limit!
    : 60;
  const offset = Number.isInteger(options.offset) && options.offset! >= 0 && options.offset! <= 10_000
    ? options.offset!
    : 0;
  const query = new URLSearchParams({
    select: "id,event_at,title,caption,mime_type,width,height,place_city,place_region,place_country,reactions",
    order: "event_at.desc",
    limit: String(limit),
    offset: String(offset)
  });
  if (options.from) query.append("event_at", `gte.${options.from}`);
  if (options.to) query.append("event_at", `lt.${options.to}`);
  try {
    const response = await fetch(`${config.baseUrl}/rest/v1/embe_media_item?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: config.secretKey }
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload.flatMap((raw): MediaMemory[] => {
      if (!raw || typeof raw !== "object") return [];
      const value = raw as Record<string, unknown>;
      const id = safeText(value.id, 36);
      const eventAt = safeText(value.event_at, 40);
      const title = safeText(value.title, 120);
      const caption = safeText(value.caption, 500);
      const mimeType = value.mime_type;
      if (!id || !UUID.test(id) || !eventAt || Number.isNaN(new Date(eventAt).getTime()) || !title || !caption || typeof mimeType !== "string" || !MEDIA_MIME.has(mimeType)) return [];
      const width = typeof value.width === "number" && value.width > 0 ? value.width : null;
      const height = typeof value.height === "number" && value.height > 0 ? value.height : null;
      const placeCity = value.place_city == null ? null : safeText(value.place_city, 80);
      const placeRegion = value.place_region == null ? null : safeText(value.place_region, 80);
      const placeCountry = value.place_country == null ? null : safeText(value.place_country, 80);
      const reactions = value.reactions && typeof value.reactions === "object" && !Array.isArray(value.reactions)
        ? Object.fromEntries(Object.entries(value.reactions as Record<string, unknown>).filter(([key, count]) =>
          ["heart", "love", "laugh", "moved"].includes(key) && Number.isInteger(count) && Number(count) >= 1 && Number(count) <= 2
        )) as MediaMemory["reactions"]
        : {};
      if ((value.place_city != null && !placeCity) || (value.place_region != null && !placeRegion) || (value.place_country != null && !placeCountry)) return [];
      return [{ id, eventAt, title, caption, mimeType: mimeType as MediaMemory["mimeType"], width, height, placeCity, placeRegion, placeCountry, reactions }];
    });
  } catch {
    return [];
  }
}

export async function getMediaMemoryDates(range: { from: string; to: string }): Promise<string[]> {
  const config = credentials();
  if (!config) return [];
  const pageSize = 1000;
  const dates: string[] = [];
  try {
    for (let offset = 0; offset < 20_000; offset += pageSize) {
      const query = new URLSearchParams({
        select: "event_at",
        order: "event_at.asc",
        limit: String(pageSize),
        offset: String(offset)
      });
      query.append("event_at", `gte.${range.from}`);
      query.append("event_at", `lt.${range.to}`);
      const response = await fetch(`${config.baseUrl}/rest/v1/embe_media_item?${query}`, {
        cache: "no-store",
        headers: { Accept: "application/json", apikey: config.secretKey }
      });
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) return [];
      dates.push(...payload.flatMap((raw): string[] => {
        if (!raw || typeof raw !== "object") return [];
        const eventAt = safeText((raw as Record<string, unknown>).event_at, 40);
        return eventAt && !Number.isNaN(new Date(eventAt).getTime()) ? [eventAt] : [];
      }));
      if (payload.length < pageSize) break;
    }
    return dates;
  } catch {
    return [];
  }
}

export async function getMediaLocator(id: string): Promise<MediaLocator | null> {
  const config = credentials();
  if (!config || !UUID.test(id)) return null;
  const query = new URLSearchParams({
    select: "object_path,mime_type,checksum_sha256",
    id: `eq.${id}`,
    limit: "1"
  });
  try {
    const response = await fetch(`${config.baseUrl}/rest/v1/embe_media_locator?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: config.secretKey }
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !payload[0] || typeof payload[0] !== "object") return null;
    const value = payload[0] as Record<string, unknown>;
    const objectPath = safeText(value.object_path, 180);
    const mimeType = value.mime_type;
    const checksum = safeText(value.checksum_sha256, 64);
    if (!objectPath || !OBJECT_PATH.test(objectPath) || typeof mimeType !== "string" || !MEDIA_MIME.has(mimeType) || !checksum || !/^[0-9a-f]{64}$/.test(checksum)) return null;
    return { objectPath, mimeType: mimeType as MediaLocator["mimeType"], checksum };
  } catch {
    return null;
  }
}
