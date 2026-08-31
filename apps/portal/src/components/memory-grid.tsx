"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { groupByDay, groupIntoTrips } from "../lib/memory-groups";
import type { MediaMemory } from "../lib/media";

const PAGE_SIZE = 24;
const MemoryMap = dynamic(() => import("./memory-map"), {
  loading: () => <section className="memory-map-loading" role="status">Đang mở bản đồ kỷ niệm…</section>
});

export type MemoryView = "ngay-thang" | "chuyen-di" | "ban-do";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}

function calendarHref(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return `/lich?month=${day.slice(0, 7)}&date=${day}#date-${day}`;
}

function calendarLink(memory: MediaMemory) {
  return (
    <a className="memory-date-link" href={calendarHref(memory.eventAt)}>
      <time dateTime={memory.eventAt}>{dateLabel(memory.eventAt)}</time>
    </a>
  );
}

function MemoryPhoto({ memory, featured = false }: { memory: MediaMemory; featured?: boolean }) {
  return (
    <article className={featured ? "memory-photo is-featured" : "memory-photo"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={memory.title} height={memory.height ?? 900} loading="lazy" src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
      <div>{calendarLink(memory)}<h3>{memory.title}</h3></div>
    </article>
  );
}

export default function MemoryGrid({ initial, date, initialView = "ngay-thang" }: { initial: MediaMemory[]; date?: string; initialView?: MemoryView }) {
  const [memories, setMemories] = useState(initial);
  const [view, setView] = useState<MemoryView>(initialView);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [state, setState] = useState<"ready" | "loading" | "error">("ready");

  async function loadMore() {
    if (state === "loading") return;
    setState("loading");
    try {
      const params = new URLSearchParams({ offset: String(memories.length), limit: String(PAGE_SIZE) });
      if (date) params.set("date", date);
      const response = await fetch(`/api/memories?${params}`, {
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

  function selectView(nextView: MemoryView) {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <>
      <nav className="memory-view-switcher" aria-label="Cách xem kỷ niệm">
        <button aria-pressed={view === "ngay-thang"} onClick={() => selectView("ngay-thang")} type="button">Ngày tháng</button>
        <button aria-pressed={view === "chuyen-di"} onClick={() => selectView("chuyen-di")} type="button">Chuyến đi</button>
        <button aria-pressed={view === "ban-do"} onClick={() => selectView("ban-do")} type="button">Bản đồ</button>
      </nav>

      {view === "ngay-thang" ? (
        <section className="memory-timeline" aria-label="Kỷ niệm theo ngày tháng">
          {groupByDay(memories).map((group) => (
            <article className="memory-day" key={group.key}>
              <header><span aria-hidden="true" /><div><h2>{group.title}</h2><p>{group.subtitle}</p></div></header>
              <div className="memory-day-photos">{group.memories.map((memory, index) => <MemoryPhoto featured={index === 0} key={memory.id} memory={memory} />)}</div>
            </article>
          ))}
        </section>
      ) : null}

      {view === "chuyen-di" ? (
        <section className="memory-trips" aria-label="Kỷ niệm theo chuyến đi">
          {groupIntoTrips(memories).map((trip) => (
            <article className="memory-trip" key={trip.key}>
              <div className="memory-trip-cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={trip.memories[0].title} height={trip.memories[0].height ?? 900} loading="lazy" src={`/api/media/${trip.memories[0].id}`} width={trip.memories[0].width ?? 1200} />
                <span>{trip.subtitle}</span>
              </div>
              <div className="memory-trip-copy"><p>CHUYẾN ĐI CỦA NHÀ MÌNH</p><h2>{trip.title}</h2><small>{dateLabel(trip.memories.at(-1)!.eventAt)} — {dateLabel(trip.memories[0].eventAt)}</small></div>
              {trip.memories.length > 1 ? <div className="memory-trip-strip">{trip.memories.slice(1, 5).map((memory) => <MemoryPhoto key={memory.id} memory={memory} />)}</div> : null}
            </article>
          ))}
        </section>
      ) : null}

      {view === "ban-do" ? <MemoryMap memories={memories} /> : null}
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
