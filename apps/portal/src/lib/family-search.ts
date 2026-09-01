import { parseMemory, type MediaMemory } from "./media";
import { parseEvent, type TimelineEvent } from "./timeline";

export type FamilyHealthSearchItem = { id: string; source: "pregnancy" | "baby" | "milestone"; kind: string; occurredAt: string; title: string; provider: string; notes: string };
export type FamilySearchResults = { memories: MediaMemory[]; journal: TimelineEvent[]; health: FamilyHealthSearchItem[] };

export function normalizeFamilySearch(value: string): string {
  const normalized = value.normalize("NFC")
    .replace(/[^\p{L}\p{N}\s/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return normalized.length >= 2 ? normalized : "";
}

function credentials(): { baseUrl: string; secretKey: string } | null {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) return null;
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? { baseUrl: parsed.origin, secretKey }
      : null;
  } catch { return null; }
}

function searchDate(value: string): string | null {
  const iso = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(value);
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/.exec(value);
  const candidate = iso ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : "";
  if (!candidate) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function endpoint(baseUrl: string, view: string, select: string, fields: string[], query: string): string {
  const params = new URLSearchParams({ select, order: "event_at.desc", limit: "24" });
  const date = searchDate(query);
  if (date) {
    const from = new Date(`${date}T00:00:00+07:00`);
    const to = new Date(from.getTime() + 86_400_000);
    params.append("event_at", `gte.${from.toISOString()}`);
    params.append("event_at", `lt.${to.toISOString()}`);
  } else {
    params.set("or", `(${fields.map((field) => `${field}.ilike.*${query}*`).join(",")})`);
  }
  return `${baseUrl}/rest/v1/${view}?${params}`;
}

export async function searchFamilyContent(value: string): Promise<FamilySearchResults> {
  const query = normalizeFamilySearch(value);
  const config = credentials();
  if (!query || !config) return { memories: [], journal: [], health: [] };
  const headers = { Accept: "application/json", apikey: config.secretKey };
  const mediaUrl = endpoint(
    config.baseUrl,
    "embe_media_item",
    "id,event_at,title,caption,mime_type,width,height,place_city,place_region,place_country,album_key,album_title,album_order,reactions",
    ["title", "caption", "album_title", "place_city", "place_region", "place_country"],
    query
  );
  const timelineUrl = endpoint(
    config.baseUrl,
    "embe_timeline_event",
    "id,event_at,portal_event_type,title,caption,album_cover_url",
    ["title", "caption"],
    query
  );
  try {
    const [mediaResponse, timelineResponse, healthResponse] = await Promise.all([
      fetch(mediaUrl, { cache: "no-store", headers, signal: AbortSignal.timeout(8000) }),
      fetch(timelineUrl, { cache: "no-store", headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${config.baseUrl}/rest/v1/rpc/embe_search_family_health`, { method: "POST", cache: "no-store", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ p_query: query }), signal: AbortSignal.timeout(8000) })
    ]);
    const media: unknown = mediaResponse.ok ? await mediaResponse.json() : [];
    const timeline: unknown = timelineResponse.ok ? await timelineResponse.json() : [];
    const healthRaw: unknown = healthResponse?.ok ? await healthResponse.json() : [];
    return {
      memories: Array.isArray(media) ? media.flatMap((item): MediaMemory[] => {
        const parsed = parseMemory(item);
        return parsed ? [parsed] : [];
      }) : [],
      journal: Array.isArray(timeline) ? timeline.flatMap((item): TimelineEvent[] => {
        const parsed = parseEvent(item);
        return parsed ? [parsed] : [];
      }) : [],
      health: Array.isArray(healthRaw) ? healthRaw.flatMap((item): FamilyHealthSearchItem[] => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>; const occurredAt = typeof row.occurred_at === "string" ? row.occurred_at : "";
        if (typeof row.id !== "string" || !["pregnancy", "baby", "milestone"].includes(String(row.source)) || !occurredAt || typeof row.title !== "string") return [];
        return [{ id: row.id, source: row.source as FamilyHealthSearchItem["source"], kind: String(row.kind ?? "other"), occurredAt, title: row.title, provider: String(row.provider ?? ""), notes: String(row.notes ?? "") }];
      }) : []
    };
  } catch {
    return { memories: [], journal: [], health: [] };
  }
}
