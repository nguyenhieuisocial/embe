export const JOURNAL_QUEUE_KEY = "embe:journal:queue:v1";

const MAX_ITEMS = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type JournalQueueItem = {
  content: string;
  authorRole: "father" | "mother";
  idempotencyKey: string;
  savedAt: number;
};

type JournalSender = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function validItem(value: unknown, now: number): value is JournalQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.content === "string"
    && item.content.trim().length > 0
    && item.content.length <= 1000
    && (item.authorRole === "father" || item.authorRole === "mother")
    && typeof item.idempotencyKey === "string"
    && UUID_V4.test(item.idempotencyKey)
    && typeof item.savedAt === "number"
    && Number.isFinite(item.savedAt)
    && now - item.savedAt >= 0
    && now - item.savedAt <= MAX_AGE_MS;
}

export function readJournalQueue(storage: Storage, now = Date.now()): JournalQueueItem[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(JOURNAL_QUEUE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => validItem(item, now)).slice(-MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function writeJournalQueue(storage: Storage, items: JournalQueueItem[]): void {
  if (items.length === 0) storage.removeItem(JOURNAL_QUEUE_KEY);
  else storage.setItem(JOURNAL_QUEUE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
}

export function enqueueJournal(storage: Storage, item: JournalQueueItem, now = Date.now()): number {
  if (!validItem(item, now)) throw new Error("invalid journal queue item");
  const existing = readJournalQueue(storage, now).filter(
    (queued) => queued.idempotencyKey !== item.idempotencyKey
  );
  const next = [...existing, item].slice(-MAX_ITEMS);
  writeJournalQueue(storage, next);
  return next.length;
}

export type JournalFlushResult = {
  accepted: number;
  discarded: number;
  pending: number;
  authRequired: boolean;
};

export async function flushJournalQueue(
  storage: Storage,
  send: JournalSender = fetch,
  now = Date.now()
): Promise<JournalFlushResult> {
  const queue = readJournalQueue(storage, now);
  let accepted = 0;
  let discarded = 0;

  function stop(index: number, authRequired: boolean): JournalFlushResult {
    const remaining = queue.slice(index);
    writeJournalQueue(storage, remaining);
    return { accepted, discarded, pending: remaining.length, authRequired };
  }

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    let response: Response;
    try {
      response = await send("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item)
      });
    } catch {
      return stop(index, false);
    }
    // A rejected note can never be accepted later, so drop it instead of letting
    // one legacy entry block every note queued behind it.
    if (response.status === 400) {
      discarded += 1;
      continue;
    }
    // An expired session can be renewed, so keep the queue and stop replaying.
    if (response.status === 401) return stop(index, true);
    if (!response.ok) return stop(index, false);
    accepted += 1;
  }

  writeJournalQueue(storage, []);
  return { accepted, discarded, pending: 0, authRequired: false };
}
