import { authorizeMutation, photoStore, privateReply } from "../../../../lib/photo-upload-server";
import { cleanJournalCaption } from "../../../../lib/journal-content";

const MAX_EXPORT_BYTES = 4 * 1024 * 1024;
const FORBIDDEN_KEYS = /(?:^|_)(?:api_key|authorization|binary|checksum|connection_string|cookie|idempotency_key|object_path|password|private_key|secret|storage_path|token|token_hash)(?:$|_)/i;

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.test(key) || containsForbiddenKey(child));
}

function safeText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function safeDate(value: unknown): string | null {
  const text = safeText(value, 40);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function journalExport(value: unknown): { published_entries: Record<string, string>[]; pending_entries: Record<string, string>[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.published_entries) || !Array.isArray(source.pending_entries)) return null;

  const published = source.published_entries.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const id = safeText(row.id, 80);
    const eventAt = safeDate(row.event_at);
    const eventType = row.event_type === "journal" || row.event_type === "milestone" ? row.event_type : null;
    const title = safeText(row.title, 120);
    const caption = typeof row.caption === "string" ? safeText(cleanJournalCaption(row.caption), 1000) : null;
    return id && eventAt && eventType && title && caption
      ? { id, event_at: eventAt, event_type: eventType, title, caption }
      : null;
  });
  const pending = source.pending_entries.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const id = safeText(row.id, 80);
    const authorRole = row.author_role === "mother" || row.author_role === "father" ? row.author_role : null;
    const status = row.status === "pending" || row.status === "processing" || row.status === "dead_letter" ? row.status : null;
    const createdAt = safeDate(row.created_at);
    const content = typeof row.content === "string" ? safeText(cleanJournalCaption(row.content), 1000) : null;
    return id && authorRole && status && createdAt && content
      ? { id, author_role: authorRole, status, created_at: createdAt, content }
      : null;
  });
  if (published.some((item) => item === null) || pending.some((item) => item === null)) return null;
  return {
    published_entries: published as Record<string, string>[],
    pending_entries: pending as Record<string, string>[]
  };
}

export async function POST(request: Request): Promise<Response> {
  const authorization = authorizeMutation(request);
  if (authorization) return privateReply({ error: authorization === 401 ? "unauthorized" : "forbidden" }, authorization);
  const store = photoStore();
  if (!store) return privateReply({ error: "temporarily_unavailable" }, 503);
  const [familyResult, journalResult] = await Promise.all([
    store.rpc("embe_export_family_data_v2"),
    store.rpc("embe_export_journal_data")
  ]);
  const data = familyResult.data;
  const journal = journalExport(journalResult.data);
  if (familyResult.error || journalResult.error || !data || typeof data !== "object" || Array.isArray(data) || !journal) {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
  const envelope = data as Record<string, unknown>;
  const familyData = envelope.data;
  if (!familyData || typeof familyData !== "object" || Array.isArray(familyData)) {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
  const currentJournal = (familyData as Record<string, unknown>).journal;
  const payload = {
    ...envelope,
    data: {
      ...(familyData as Record<string, unknown>),
      journal: {
        ...(currentJournal && typeof currentJournal === "object" && !Array.isArray(currentJournal)
          ? currentJournal as Record<string, unknown>
          : {}),
        ...journal
      }
    }
  };
  if (containsForbiddenKey(payload)) return privateReply({ error: "temporarily_unavailable" }, 503);
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MAX_EXPORT_BYTES) {
    return privateReply({ error: "export_too_large" }, 413);
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="embe-family-data-${day}.json"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff"
    }
  });
}
