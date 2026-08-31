"use client";

import { useState } from "react";

import type { MediaMemory } from "../lib/media";

const PAGE_SIZE = 24;

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}

export default function MemoryGrid({ initial }: { initial: MediaMemory[] }) {
  const [memories, setMemories] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [state, setState] = useState<"ready" | "loading" | "error">("ready");

  async function loadMore() {
    if (state === "loading") return;
    setState("loading");
    try {
      const response = await fetch(`/api/memories?offset=${memories.length}&limit=${PAGE_SIZE}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("load failed");
      const payload = await response.json() as { memories?: MediaMemory[]; hasMore?: boolean };
      if (!Array.isArray(payload.memories)) throw new Error("invalid response");
      setMemories((current) => [...current, ...payload.memories!]);
      setHasMore(Boolean(payload.hasMore));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <section className="memory-grid" aria-label="Ảnh kỷ niệm gia đình">
        {memories.map((memory) => (
          <article className="memory-card" key={memory.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/media/${memory.id}`}
              alt={memory.title}
              loading="lazy"
              width={memory.width ?? 1200}
              height={memory.height ?? 900}
            />
            <div>
              <time dateTime={memory.eventAt}>{dateLabel(memory.eventAt)}</time>
              <h2>{memory.title}</h2>
            </div>
          </article>
        ))}
      </section>
      {hasMore ? (
        <button className="memory-more" disabled={state === "loading"} onClick={loadMore} type="button">
          {state === "loading" ? "Đang mở thêm…" : state === "error" ? "Thử mở lại" : "Xem thêm kỷ niệm"}
        </button>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {state === "error" ? "Chưa mở được ảnh mới. Chạm Thử mở lại." : `${memories.length} ảnh đang hiển thị.`}
      </p>
    </>
  );
}
