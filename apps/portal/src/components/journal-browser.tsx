"use client";

import { getCalendarGrid } from "@lichta/core";
import { useEffect, useMemo, useState } from "react";

import { adjacentMonth, dateKey, lunarDateLabel, monthKey, parseDateKey } from "../lib/calendar";
import type { TimelineEvent } from "../lib/timeline";
import JournalCaption from "./journal-caption";

type JournalView = "timeline" | "days" | "calendar";
type JournalKind = "all" | TimelineEvent["eventType"];

const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const viewLabels: Array<{ key: JournalView; label: string }> = [
  { key: "timeline", label: "Dòng thời gian" },
  { key: "days", label: "Theo ngày" },
  { key: "calendar", label: "Lịch" }
];
const kindLabels: Array<{ key: JournalKind; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "journal", label: "Ghi chép" },
  { key: "milestone", label: "Cột mốc" }
];

function searchableText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("vi").replace(/đ/g, "d");
}

function longDate(value: Date | string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Ho_Chi_Minh"
  }).format(typeof value === "string" ? new Date(value) : value);
}

function shortTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}

function EventCard({ event, showTime = true }: { event: TimelineEvent; showTime?: boolean }) {
  return (
    <article className={`journal-view-entry is-${event.eventType}${event.pending ? " is-pending" : ""}`}>
      <div className="journal-view-entry-head">
        <span>{event.pending ? "Đang đồng bộ" : event.eventType === "milestone" ? "Cột mốc" : "Ghi chép"}</span>
        {showTime ? <time dateTime={event.eventAt}>{shortTime(event.eventAt)}</time> : null}
      </div>
      <strong>{event.title}</strong>
      <JournalCaption caption={event.caption} />
      {event.albumCoverUrl ? <img src={event.albumCoverUrl} alt="" loading="lazy" /> : null}
    </article>
  );
}

function initialMonth(events: TimelineEvent[]): string {
  return events[0] ? dateKey(events[0].eventAt).slice(0, 7) : monthKey(new Date().getMonth() + 1, new Date().getFullYear());
}

export default function JournalBrowser({ events }: { events: TimelineEvent[] }) {
  const [view, setView] = useState<JournalView>("timeline");
  const [kind, setKind] = useState<JournalKind>("all");
  const [query, setQuery] = useState("");
  const [monthValue, setMonthValue] = useState(() => initialMonth(events));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const visibleEvents = useMemo(() => {
    const needle = searchableText(query.trim());
    return events.filter((event) => {
      if (kind !== "all" && event.eventType !== kind) return false;
      return !needle || searchableText(`${event.title} ${event.caption}`).includes(needle);
    });
  }, [events, kind, query]);
  const grouped = useMemo(() => {
    const result = new Map<string, TimelineEvent[]>();
    for (const event of visibleEvents) {
      const key = dateKey(event.eventAt);
      result.set(key, [...(result.get(key) ?? []), event]);
    }
    return result;
  }, [visibleEvents]);
  const visibleDays = grouped.size;
  const [year, month] = monthValue.split("-").map(Number);
  const cells = useMemo(
    () => getCalendarGrid(month, year, selectedDate ? parseDateKey(selectedDate) : undefined, 1),
    [month, selectedDate, year]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem("embe:journal:view:v1");
      if (saved === "timeline" || saved === "days" || saved === "calendar") setView(saved);
    } catch { /* Safari private mode can deny storage access */ }
  }, []);

  function chooseView(next: JournalView) {
    setView(next);
    try { localStorage.setItem("embe:journal:view:v1", next); } catch { /* Safari private mode can deny storage access */ }
  }

  function moveMonth(offset: -1 | 1) {
    setMonthValue(adjacentMonth(month, year, offset));
    setSelectedDate(null);
  }

  if (!events.length) return (
    <div className="empty-state journal-browser-empty">
      <strong>Nhật ký đang chờ điều đầu tiên</strong>
      <p>Một câu ngắn, một tấm ảnh hay một cột mốc đều có thể bắt đầu.</p>
      <a className="btn btn-primary" href="/ghi-lai">Ghi lại ngay</a>
    </div>
  );

  return (
    <div className="journal-browser">
      <div className="journal-view-switch" role="group" aria-label="Cách xem nhật ký">
        {viewLabels.map((item) => <button type="button" key={item.key} aria-pressed={view === item.key} onClick={() => chooseView(item.key)}>{item.label}</button>)}
      </div>

      <div className="journal-browser-tools">
        <div className="journal-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" aria-label="Tìm trong nhật ký" placeholder="Tìm người, nơi hoặc kỷ niệm…" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query ? <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery("")}>×</button> : null}
        </div>
        <div className="journal-kind-filter" role="group" aria-label="Lọc loại nhật ký">
          {kindLabels.map((item) => <button type="button" key={item.key} aria-pressed={kind === item.key} onClick={() => setKind(item.key)}>{item.label}</button>)}
        </div>
        <p aria-live="polite">{visibleEvents.length} mục · {visibleDays} ngày</p>
      </div>

      {!visibleEvents.length ? <div className="journal-filter-empty">
        <strong>Chưa tìm thấy điều này</strong>
        <p>Thử từ khóa ngắn hơn hoặc chọn Tất cả.</p>
      </div> : null}

      {view === "timeline" && visibleEvents.length ? <div className="journal-view-timeline">
        {visibleEvents.map((event) => <div className="journal-view-timeline-row" key={event.id}>
          <time dateTime={event.eventAt}>{longDate(event.eventAt)}</time>
          <EventCard event={event} />
        </div>)}
      </div> : null}

      {view === "days" && visibleEvents.length ? <div className="journal-day-groups">
        {[...grouped.entries()].map(([key, entries]) => <section className="journal-day-group" role="group" aria-label={longDate(`${key}T12:00:00+07:00`)} key={key}>
          <header><div><time dateTime={key}>{longDate(`${key}T12:00:00+07:00`)}</time><small>Âm lịch {lunarDateLabel(parseDateKey(key)!)}</small></div><span>{entries.length} ghi chép</span></header>
          <div>{entries.map((event) => <EventCard event={event} key={event.id} />)}</div>
        </section>)}
      </div> : null}

      {view === "calendar" && visibleEvents.length ? <div className="journal-calendar-view">
        <div className="journal-calendar-toolbar">
          <button type="button" aria-label="Tháng trước" onClick={() => moveMonth(-1)}>←</button>
          <strong>Tháng {month}, {year}</strong>
          <button type="button" aria-label="Tháng sau" onClick={() => moveMonth(1)}>→</button>
        </div>
        <div className="journal-calendar-week" aria-hidden="true">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="journal-calendar-grid">
          {cells.map((cell) => {
            const key = dateKey(cell.solar);
            const count = grouped.get(key)?.length ?? 0;
            return <button type="button" className={`${cell.isCurrentMonth ? "" : "is-outside"} ${selectedDate === key ? "is-selected" : ""} ${count ? "has-entry" : ""}`.trim()}
              aria-label={`Ngày ${cell.solar.getDate()} tháng ${cell.solar.getMonth() + 1} năm ${cell.solar.getFullYear()}, âm lịch ${lunarDateLabel(cell.solar)}, ${count} ghi chép`}
              onClick={() => setSelectedDate(key)} key={key}>
              <b>{cell.solar.getDate()}</b><small>{lunarDateLabel(cell.solar)}</small>{count ? <i>{count}</i> : null}
            </button>;
          })}
        </div>
        <p className="journal-calendar-note">Chữ nhỏ là ngày Âm lịch · số tròn là lượng ghi chép.</p>
        {selectedDate ? <section className="journal-calendar-selected" role="region" aria-label={`Nhật ký ${longDate(`${selectedDate}T12:00:00+07:00`)}`}>
          <h2>{longDate(`${selectedDate}T12:00:00+07:00`)}</h2>
          {(grouped.get(selectedDate) ?? []).length
            ? (grouped.get(selectedDate) ?? []).map((event) => <EventCard event={event} key={event.id} />)
            : <p>Ngày này chưa có ghi chép.</p>}
        </section> : null}
      </div> : null}
    </div>
  );
}
