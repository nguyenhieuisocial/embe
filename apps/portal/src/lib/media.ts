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
  albumKey: string;
  albumTitle: string;
  albumOrder: number;
  reactions: Partial<Record<"heart" | "love" | "laugh" | "moved", number>>;
};

export type MediaAlbum = {
  key: string;
  title: string;
  count: number;
  covers: MediaMemory[];
};

export type MediaLocator = {
  objectPath: string;
  mimeType: "image/jpeg" | "image/webp";
  checksum: string;
};

const MEDIA_MIME = new Set(["image/jpeg", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_PATH = /^assets\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(jpg|webp)$/;
const ALBUM_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_SELECT = "id,event_at,title,caption,mime_type,width,height,place_city,place_region,place_country,album_key,album_title,album_order,reactions";

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

export function parseMemory(raw: unknown): MediaMemory | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = safeText(value.id, 36);
  const eventAt = safeText(value.event_at, 40);
  const title = safeText(value.title, 120);
  const caption = safeText(value.caption, 500);
  const albumKey = safeText(value.album_key, 64);
  const albumTitle = safeText(value.album_title, 120);
  const albumOrder = value.album_order;
  const mimeType = value.mime_type;
  if (!id || !UUID.test(id) || !eventAt || Number.isNaN(new Date(eventAt).getTime()) || !title || !caption ||
      !albumKey || !ALBUM_KEY.test(albumKey) || !albumTitle || !Number.isInteger(albumOrder) || Number(albumOrder) < 0 || Number(albumOrder) > 999 ||
      typeof mimeType !== "string" || !MEDIA_MIME.has(mimeType)) return null;
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
  if ((value.place_city != null && !placeCity) || (value.place_region != null && !placeRegion) || (value.place_country != null && !placeCountry)) return null;
  return {
    id, eventAt, title, caption, mimeType: mimeType as MediaMemory["mimeType"], width, height,
    placeCity, placeRegion, placeCountry, albumKey, albumTitle, albumOrder: Number(albumOrder), reactions
  };
}

export async function getMediaMemories(
  options: { album?: string; from?: string; limit?: number; offset?: number; to?: string } = {}
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
    select: MEDIA_SELECT,
    order: "event_at.desc",
    limit: String(limit),
    offset: String(offset)
  });
  if (options.from) query.append("event_at", `gte.${options.from}`);
  if (options.to) query.append("event_at", `lt.${options.to}`);
  if (options.album && ALBUM_KEY.test(options.album) && options.album.length <= 64) query.append("album_key", `eq.${options.album}`);
  try {
    const response = await fetch(`${config.baseUrl}/rest/v1/embe_media_item?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: config.secretKey }
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload.flatMap((raw): MediaMemory[] => {
      const memory = parseMemory(raw);
      return memory ? [memory] : [];
    });
  } catch {
    return [];
  }
}

export async function getMediaMemory(id: string): Promise<MediaMemory | null> {
  const config = credentials();
  if (!config || !UUID.test(id)) return null;
  const query = new URLSearchParams({ select: MEDIA_SELECT, id: `eq.${id}`, limit: "1" });
  try {
    const response = await fetch(`${config.baseUrl}/rest/v1/embe_media_item?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: config.secretKey }
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? parseMemory(payload[0]) : null;
  } catch {
    return null;
  }
}

export async function getMediaAlbums(): Promise<MediaAlbum[]> {
  const config = credentials();
  if (!config) return [];
  const pageSize = 1000;
  const groups = new Map<string, MediaAlbum & { order: number }>();
  try {
    for (let offset = 0; offset < 20_000; offset += pageSize) {
      const query = new URLSearchParams({
        select: MEDIA_SELECT,
        order: "album_order.asc,event_at.desc",
        limit: String(pageSize),
        offset: String(offset)
      });
      const response = await fetch(`${config.baseUrl}/rest/v1/embe_media_item?${query}`, {
        cache: "no-store",
        headers: { Accept: "application/json", apikey: config.secretKey }
      });
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) return [];
      for (const raw of payload) {
        const memory = parseMemory(raw);
        if (!memory) continue;
        const current = groups.get(memory.albumKey);
        if (current) {
          current.count += 1;
          if (current.covers.length < 3) current.covers.push(memory);
        } else {
          groups.set(memory.albumKey, {
            key: memory.albumKey,
            title: memory.albumTitle,
            count: 1,
            covers: [memory],
            order: memory.albumOrder
          });
        }
      }
      if (payload.length < pageSize) break;
    }
    return [...groups.values()].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "vi"))
      .map(({ order: _order, ...album }) => album);
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
