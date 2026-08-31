import { afterEach, describe, expect, it, vi } from "vitest";

import { enqueueJournal, flushJournalQueue, readJournalQueue } from "../src/lib/journal-offline";

const item = {
  content: "Một điều đáng nhớ.",
  authorRole: "mother" as const,
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  savedAt: 1_788_100_000_000
};

const legacyItem = {
  content: "Ghi chú cũ máy chủ không nhận.",
  authorRole: "father" as const,
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  savedAt: 1_788_100_000_000
};

function bodyOf(call: unknown[]): { idempotencyKey: string } {
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe("journal offline queue", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("keeps a bounded, validated queue and deduplicates retry keys", () => {
    enqueueJournal(localStorage, item, item.savedAt);
    enqueueJournal(localStorage, item, item.savedAt);

    expect(readJournalQueue(localStorage, item.savedAt)).toEqual([item]);
  });

  it("replays the same idempotency key and removes only accepted entries", async () => {
    enqueueJournal(localStorage, item, item.savedAt);
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    const result = await flushJournalQueue(localStorage, send, item.savedAt);

    expect(result).toEqual({ accepted: 1, discarded: 0, pending: 0, authRequired: false });
    expect(bodyOf(send.mock.calls[0])).toMatchObject({ idempotencyKey: item.idempotencyKey });
  });

  it("retains pending entries when the network is unavailable", async () => {
    enqueueJournal(localStorage, item, item.savedAt);
    const result = await flushJournalQueue(
      localStorage,
      vi.fn().mockRejectedValue(new TypeError("offline")),
      item.savedAt
    );

    expect(result).toEqual({ accepted: 0, discarded: 0, pending: 1, authRequired: false });
    expect(readJournalQueue(localStorage, item.savedAt)).toHaveLength(1);
  });

  it("drops a permanently rejected note so it cannot block the notes behind it", async () => {
    enqueueJournal(localStorage, legacyItem, item.savedAt);
    enqueueJournal(localStorage, item, item.savedAt);
    const send = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));

    const result = await flushJournalQueue(localStorage, send, item.savedAt);

    expect(result).toEqual({ accepted: 1, discarded: 1, pending: 0, authRequired: false });
    expect(send).toHaveBeenCalledTimes(2);
    expect(bodyOf(send.mock.calls[1]).idempotencyKey).toBe(item.idempotencyKey);
    expect(readJournalQueue(localStorage, item.savedAt)).toEqual([]);
  });

  it("keeps every queued note and stops replaying when the session expired", async () => {
    enqueueJournal(localStorage, legacyItem, item.savedAt);
    enqueueJournal(localStorage, item, item.savedAt);
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    const result = await flushJournalQueue(localStorage, send, item.savedAt);

    expect(result).toEqual({ accepted: 0, discarded: 0, pending: 2, authRequired: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(readJournalQueue(localStorage, item.savedAt)).toEqual([legacyItem, item]);
  });

  it("keeps the current and later notes when the server is temporarily unavailable", async () => {
    enqueueJournal(localStorage, legacyItem, item.savedAt);
    enqueueJournal(localStorage, item, item.savedAt);
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    const result = await flushJournalQueue(localStorage, send, item.savedAt);

    expect(result).toEqual({ accepted: 0, discarded: 0, pending: 2, authRequired: false });
    expect(send).toHaveBeenCalledTimes(1);
    expect(readJournalQueue(localStorage, item.savedAt).map((queued) => queued.idempotencyKey))
      .toEqual([legacyItem.idempotencyKey, item.idempotencyKey]);
  });
});
