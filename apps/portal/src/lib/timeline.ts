import { cleanJournalCaption } from "./journal-content";

export type TimelineEvent = {
  id: string;
  eventAt: string;
  eventType: "journal" | "milestone";
  title: string;
  caption: string;
  albumCoverUrl: string | null;
  pending?: boolean;
};

export type TimelineFreshness = "fresh" | "stale" | "unavailable";

type RawTimelineEvent = {
  id?: unknown;
  event_at?: unknown;
  portal_event_type?: unknown;
  title?: unknown;
  caption?: unknown;
  album_cover_url?: unknown;
};

type RawPendingJournal = {
  id?: unknown;
  created_at?: unknown;
  content?: unknown;
  author_role?: unknown;
  status?: unknown;
};

function safeText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

export function parseEvent(value: RawTimelineEvent): TimelineEvent | null {
  const id = safeText(value.id, 80);
  const eventAt = safeText(value.event_at, 40);
  const title = safeText(value.title, 120);
  const cleanCaption = typeof value.caption === "string" ? cleanJournalCaption(value.caption) : null;
  const caption = safeText(cleanCaption, 1000);
  const eventType = value.portal_event_type;
  if (!id || !eventAt || !title || !caption || (eventType !== "journal" && eventType !== "milestone")) {
    return null;
  }
  const parsedDate = new Date(eventAt);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const cover = typeof value.album_cover_url === "string" ? value.album_cover_url : null;
  const albumCoverUrl = cover?.startsWith("https://") ? cover : null;
  return { id, eventAt, eventType, title, caption, albumCoverUrl };
}

export async function getTimeline(requestedLimit = 20): Promise<TimelineEvent[]> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey || !baseUrl.startsWith("https://")) return [];
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 20;
  const query = new URLSearchParams({
    select: "id,event_at,portal_event_type,title,caption,album_cover_url",
    order: "event_at.desc",
    limit: String(limit)
  });
  try {
    const response = await fetch(`${baseUrl}/rest/v1/embe_timeline_event?${query}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        apikey: secretKey
      }
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload.map((item) => parseEvent(item as RawTimelineEvent)).filter((item): item is TimelineEvent => item !== null);
  } catch {
    return [];
  }
}

export async function getPendingJournalEntries(requestedLimit = 20): Promise<TimelineEvent[]> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey || !baseUrl.startsWith("https://")) return [];
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 20;
  const query = new URLSearchParams({
    select: "id,created_at,content,author_role,status",
    order: "created_at.desc",
    limit: String(limit)
  });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/embe_pending_journal?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: secretKey },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload.flatMap((value): TimelineEvent[] => {
      if (!value || typeof value !== "object") return [];
      const row = value as RawPendingJournal;
      const id = safeText(row.id, 64);
      const eventAt = safeText(row.created_at, 40);
      const cleanCaption = typeof row.content === "string" ? cleanJournalCaption(row.content) : null;
      const caption = safeText(cleanCaption, 1000);
      const validRole = row.author_role === "mother" || row.author_role === "father";
      const validStatus = row.status === "pending" || row.status === "processing";
      if (!id || !eventAt || !caption || !validRole || !validStatus || Number.isNaN(new Date(eventAt).getTime())) return [];
      return [{
        id: `pending-${id}`,
        eventAt,
        eventType: "journal",
        title: row.author_role === "mother" ? "Mẹ Ngân ghi lại" : "Ba Hiếu ghi lại",
        caption,
        albumCoverUrl: null,
        pending: true
      }];
    });
  } catch {
    return [];
  }
}

export async function getTimelineFreshness(now = new Date()): Promise<TimelineFreshness> {
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey || !baseUrl.startsWith("https://")) return "unavailable";
  const query = new URLSearchParams({ select: "last_success_at", limit: "1" });
  try {
    const response = await fetch(`${baseUrl}/rest/v1/embe_portal_sync_status?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: secretKey }
    });
    if (!response.ok) return "unavailable";
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || typeof payload[0]?.last_success_at !== "string") return "stale";
    const lastSuccess = new Date(payload[0].last_success_at);
    if (Number.isNaN(lastSuccess.getTime())) return "stale";
    return now.getTime() - lastSuccess.getTime() <= 15 * 60 * 1000 ? "fresh" : "stale";
  } catch {
    return "unavailable";
  }
}
