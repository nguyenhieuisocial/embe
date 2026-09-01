"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { groupByDay, groupIntoTrips } from "../lib/memory-groups";
import type { MediaAlbum, MediaMemory } from "../lib/media";
import { readDeviceRole } from "../lib/device-preferences";
import PhotoShareButton from "./photo-share-button";
import PhotoDownloadButton from "./photo-download-button";

const PAGE_SIZE = 24;
const REACTIONS = [
  ["heart", "♥", "Thương"], ["love", "😍", "Yêu quá"],
  ["laugh", "😄", "Vui quá"], ["moved", "🥹", "Xúc động"]
] as const;
const MemoryMap = dynamic(() => import("./memory-map"), {
  loading: () => <section className="memory-map-loading" role="status">Đang mở bản đồ kỷ niệm…</section>
});

export type MemoryView = "album" | "ngay-thang" | "chuyen-di" | "ban-do";

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
    <Link className="memory-date-link" href={calendarHref(memory.eventAt)}>
      <time dateTime={memory.eventAt}>{dateLabel(memory.eventAt)}</time>
    </Link>
  );
}

function MemoryPhoto({ memory, featured = false, onOpen }: { memory: MediaMemory; featured?: boolean; onOpen: () => void }) {
  const [reactions, setReactions] = useState(memory.reactions);
  const [pending, setPending] = useState<string | null>(null);

  async function react(emoji: typeof REACTIONS[number][0]) {
    if (pending) return;
    const saved = readDeviceRole(window.localStorage) ?? window.localStorage.getItem("embe-photo-author");
    const authorRole = saved === "father" ? "father" : "mother";
    setPending(emoji);
    try {
      const response = await fetch(`/api/memories/${memory.id}/reactions`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorRole, emoji })
      });
      if (!response.ok) throw new Error("reaction failed");
      const payload = await response.json() as { reactions?: MediaMemory["reactions"] };
      if (payload.reactions) setReactions(payload.reactions);
    } catch {
      // Keep the current counts; the same button remains available for retry.
    } finally {
      setPending(null);
    }
  }

  return (
    <article className={featured ? "memory-photo is-featured" : "memory-photo"}>
      <button aria-label={`Mở ảnh ${memory.title}`} className="memory-photo-open" onClick={onOpen} type="button">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={memory.title} height={memory.height ?? 900} loading="lazy" src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
      </button>
      <div>{calendarLink(memory)}<h3>{memory.title}</h3></div>
      <div className="memory-reactions" aria-label="Phản hồi riêng của gia đình">
        {REACTIONS.map(([key, glyph, label]) => (
          <button aria-label={label} disabled={pending !== null} key={key} onClick={() => react(key)} type="button">
            <span aria-hidden="true">{glyph}</span>{reactions[key] ? <small>{reactions[key]}</small> : null}
          </button>
        ))}
      </div>
    </article>
  );
}

function AlbumOverview({ albums }: { albums: MediaAlbum[] }) {
  return (
    <section className="memory-albums" aria-label="Các album theo folder gia đình">
      {albums.map((album) => (
        <Link className="memory-album" href={`/ky-niem?view=album&album=${encodeURIComponent(album.key)}`} key={album.key}>
          <span className="memory-album-covers" aria-hidden="true">
            {album.covers.slice(0, 3).map((cover) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" height={cover.height ?? 900} key={cover.id} loading="lazy" src={`/api/media/${cover.id}`} width={cover.width ?? 1200} />
            ))}
          </span>
          <span className="memory-album-copy"><strong>{album.title}</strong><small>{album.count.toLocaleString("vi-VN")} ảnh đã chọn</small></span>
          <span className="memory-album-arrow" aria-hidden="true">›</span>
        </Link>
      ))}
    </section>
  );
}

function DayAlbumOverview({ memories }: { memories: MediaMemory[] }) {
  return (
    <section className="memory-day-albums" aria-label="Album kỷ niệm theo ngày">
      {groupByDay(memories).map((group) => {
        const cover = group.memories[0];
        return (
          <Link
            aria-label={`Mở album ${group.title}`}
            className="memory-day-album"
            href={`/ky-niem?view=ngay-thang&date=${group.key}`}
            key={group.key}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" height={cover.height ?? 900} loading="lazy" src={`/api/media/${cover.id}`} width={cover.width ?? 1200} />
            <span className="memory-day-album-shade" aria-hidden="true" />
            <span className="memory-day-album-copy">
              <strong>{group.title}</strong>
              <small>{group.subtitle}</small>
            </span>
            <span className="memory-day-album-count">{group.memories.length.toLocaleString("vi-VN")} ảnh</span>
          </Link>
        );
      })}
    </section>
  );
}

function DayAlbumDetail({ memories, onOpen }: { memories: MediaMemory[]; onOpen: (index: number) => void }) {
  return (
    <section className="memory-album-detail" aria-label="Album kỷ niệm trong ngày">
      <header>
        <Link aria-label="Tất cả ngày" href="/ky-niem?view=ngay-thang">‹ Tất cả ngày</Link>
        <div>
          <h2>{memories[0] ? dateLabel(memories[0].eventAt) : "Kỷ niệm trong ngày"}</h2>
          <p>{memories.length.toLocaleString("vi-VN")} ảnh đang hiển thị</p>
        </div>
      </header>
      <div className="memory-album-grid">
        {memories.map((memory, index) => (
          <button aria-label={`Mở ảnh ${memory.title}`} key={memory.id} onClick={() => onOpen(index)} type="button">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={memory.title} height={memory.height ?? 900} loading="lazy" src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
          </button>
        ))}
      </div>
    </section>
  );
}

function PhotoViewer({ memory, index, total, onClose, onMove }: {
  memory: MediaMemory;
  index: number;
  total: number;
  onClose: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number; zoom: number } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const usedPinch = useRef(false);
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function applyZoom(next: number): void {
    const value = Math.min(4, Math.max(1, Math.round(next * 100) / 100));
    zoomRef.current = value;
    setZoom(value);
    if (value === 1) setOffset({ x: 0, y: 0 });
  }

  function resetZoom(): void {
    applyZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function boundedOffset(x: number, y: number, scale = zoomRef.current): { x: number; y: number } {
    const stage = stageRef.current;
    if (!stage || scale <= 1) return { x: 0, y: 0 };
    const maxX = stage.clientWidth * (scale - 1) / 2;
    const maxY = stage.clientHeight * (scale - 1) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }

  function pointerDistance(): number {
    const values = [...pointers.current.values()];
    return values.length < 2 ? 0 : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if ((event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y, zoom: zoomRef.current };
      usedPinch.current = false;
    } else if (pointers.current.size === 2) {
      pinchStart.current = { distance: pointerDistance(), zoom: zoomRef.current };
      usedPinch.current = true;
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinchStart.current?.distance) {
      applyZoom(pinchStart.current.zoom * pointerDistance() / pinchStart.current.distance);
      return;
    }
    if (pointers.current.size === 1 && dragStart.current?.zoom && dragStart.current.zoom > 1) {
      setOffset(boundedOffset(
        dragStart.current.offsetX + event.clientX - dragStart.current.x,
        dragStart.current.offsetY + event.clientY - dragStart.current.y
      ));
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const start = dragStart.current;
    pointers.current.delete(event.pointerId);
    if (start?.zoom === 1 && !usedPinch.current) {
      const horizontal = event.clientX - start.x;
      const vertical = event.clientY - start.y;
      if (Math.abs(horizontal) > 48 && Math.abs(horizontal) > Math.abs(vertical)) onMove(horizontal > 0 ? -1 : 1);
    }
    if (pointers.current.size === 0) {
      dragStart.current = null;
      pinchStart.current = null;
      usedPinch.current = false;
    } else {
      const remaining = [...pointers.current.values()][0];
      dragStart.current = { x: remaining.x, y: remaining.y, offsetX: offset.x, offsetY: offset.y, zoom: zoomRef.current };
    }
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => { resetZoom(); }, [memory.id]);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowLeft" && zoom === 1) onMove(-1);
    if (event.key === "ArrowRight" && zoom === 1) onMove(1);
    if (event.key === "+" || event.key === "=") applyZoom(zoomRef.current + .5);
    if (event.key === "-") applyZoom(zoomRef.current - .5);
    if (event.key === "0") resetZoom();
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? []
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div ref={dialogRef} aria-label={memory.title} aria-modal="true" className="photo-viewer" role="dialog" onKeyDown={keepFocusInside}>
      <header>
        <span>Ảnh {index + 1} / {total}</span>
        <div className="photo-viewer-actions">
          <PhotoDownloadButton memory={memory} />
          <PhotoShareButton memory={memory} />
          <a aria-label="In ảnh này" className="photo-viewer-print" href={`/in-anh/${memory.id}`}>
            <span aria-hidden="true">▣</span><span className="photo-action-label">In ảnh</span>
          </a>
          <button ref={closeRef} aria-label="Đóng ảnh" className="photo-viewer-close" onClick={onClose} type="button">×</button>
        </div>
      </header>
      <div ref={stageRef} className={`photo-viewer-stage${zoom > 1 ? " is-zoomed" : ""}`}
        onPointerCancel={onPointerUp} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={memory.title} draggable="false" height={memory.height ?? 900} onDoubleClick={() => zoom > 1 ? resetZoom() : applyZoom(2)}
          src={`/api/media/${memory.id}`} style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})` }} width={memory.width ?? 1200} />
        {total > 1 && zoom === 1 ? <>
          <button aria-label="Ảnh trước" className="photo-viewer-prev" onClick={() => onMove(-1)} type="button">‹</button>
          <button aria-label="Ảnh sau" className="photo-viewer-next" onClick={() => onMove(1)} type="button">›</button>
        </> : null}
        <div className="photo-viewer-zoom" aria-label="Điều khiển phóng to ảnh">
          <button aria-label="Thu nhỏ ảnh" disabled={zoom === 1} onClick={() => applyZoom(zoom - .5)} type="button">−</button>
          <button aria-label="Đặt ảnh về kích thước ban đầu" disabled={zoom === 1} onClick={resetZoom} type="button">{Math.round(zoom * 100)}%</button>
          <button aria-label="Phóng to ảnh" disabled={zoom === 4} onClick={() => applyZoom(zoom + .5)} type="button">+</button>
        </div>
      </div>
      <footer>
        <div className="photo-viewer-caption"><time dateTime={memory.eventAt}>{dateLabel(memory.eventAt)}</time><strong>{memory.title}</strong><p>{memory.caption}</p></div>
        <span className="photo-viewer-swipe">{zoom > 1 ? "Kéo để xem · chạm đôi để thu" : total > 1 ? "Vuốt ngang · chụm để phóng to" : "Chụm hoặc chạm đôi để phóng to"}</span>
      </footer>
    </div>
  );
}

export default function MemoryGrid({ initial, albums = [], album, date, initialView = "ngay-thang" }: {
  initial: MediaMemory[];
  albums?: MediaAlbum[];
  album?: string;
  date?: string;
  initialView?: MemoryView;
}) {
  const [memories, setMemories] = useState(initial);
  const [view, setView] = useState<MemoryView>(initialView);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [state, setState] = useState<"ready" | "loading" | "error">("ready");
  const selectedAlbumCount = albums.find((item) => item.key === album)?.count;

  async function loadMore() {
    if (state === "loading") return;
    setState("loading");
    try {
      const params = new URLSearchParams({ offset: String(memories.length), limit: String(PAGE_SIZE) });
      if (date) params.set("date", date);
      if (album) params.set("album", album);
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
    if (nextView !== "album") url.searchParams.delete("album");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function moveViewer(direction: -1 | 1) {
    setActiveIndex((current) => current == null ? null : (current + direction + memories.length) % memories.length);
  }

  return (
    <>
      <nav className="memory-view-switcher" aria-label="Cách xem kỷ niệm">
        <Link href="/lich">Lịch</Link>
        <button aria-pressed={view === "album"} onClick={() => selectView("album")} type="button">Album</button>
        <button aria-label="Ngày tháng" aria-pressed={view === "ngay-thang"} onClick={() => selectView("ngay-thang")} type="button">Ngày</button>
        <button aria-label="Chuyến đi" aria-pressed={view === "chuyen-di"} onClick={() => selectView("chuyen-di")} type="button">Chuyến</button>
        <button aria-pressed={view === "ban-do"} onClick={() => selectView("ban-do")} type="button">Bản đồ</button>
      </nav>

      {view === "album" && !album ? <AlbumOverview albums={albums} /> : null}

      {view === "album" && album ? (
        <section className="memory-album-detail" aria-label={initial[0]?.albumTitle ?? "Album gia đình"}>
          <header><Link href="/ky-niem?view=album">‹ Tất cả album</Link><div><h2>{initial[0]?.albumTitle ?? "Album gia đình"}</h2><p>{(selectedAlbumCount ?? memories.length).toLocaleString("vi-VN")} ảnh đã chọn</p></div></header>
          <div className="memory-album-grid">
            {memories.map((memory, index) => (
              <button aria-label={`Mở ảnh ${memory.title}`} key={memory.id} onClick={() => setActiveIndex(index)} type="button">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={memory.title} height={memory.height ?? 900} loading="lazy" src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view === "ngay-thang" && !date ? <DayAlbumOverview memories={memories} /> : null}

      {view === "ngay-thang" && date ? <DayAlbumDetail memories={memories} onOpen={setActiveIndex} /> : null}

      {view === "chuyen-di" ? (
        <section className="memory-trips" aria-label="Kỷ niệm theo chuyến đi">
          {groupIntoTrips(memories).map((trip) => (
            <article className="memory-trip" key={trip.key}>
              <button
                aria-label={`Mở ảnh ${trip.memories[0].title}`}
                className="memory-trip-cover"
                onClick={() => setActiveIndex(memories.findIndex((item) => item.id === trip.memories[0].id))}
                type="button"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={trip.memories[0].title} height={trip.memories[0].height ?? 900} loading="lazy" src={`/api/media/${trip.memories[0].id}`} width={trip.memories[0].width ?? 1200} />
                <span>{trip.subtitle}</span>
              </button>
              <div className="memory-trip-copy">
                <div className="memory-trip-route" aria-hidden="true">
                  <span className="memory-trip-route-start">♥</span>
                  <span className="memory-trip-route-line"><i /></span>
                  <span className="memory-trip-route-end">⌖</span>
                </div>
                <p>Chuyến đi của nhà mình</p>
                <h2>{trip.title}</h2>
                <small>{dateLabel(trip.memories.at(-1)!.eventAt)} — {dateLabel(trip.memories[0].eventAt)}</small>
              </div>
              {trip.memories.length > 1 ? (
                <section className="memory-trip-gallery" aria-label={`Ảnh trong chuyến ${trip.title}`}>
                  <header><strong>Khoảnh khắc tiếp theo</strong><span>Vuốt để xem từng ảnh</span></header>
                  <div className="memory-trip-strip">
                    {trip.memories.slice(1).map((memory, index) => (
                      <button
                        aria-label={`Mở ảnh ${memory.title}`}
                        className="memory-trip-slide"
                        key={memory.id}
                        onClick={() => setActiveIndex(memories.findIndex((item) => item.id === memory.id))}
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={memory.title} height={memory.height ?? 900} loading="lazy" src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
                        <span>{index + 2} / {trip.memories.length}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {view === "ban-do" ? <MemoryMap memories={memories} /> : null}
      {hasMore && !(view === "album" && !album) ? (
        <button className="memory-more" disabled={state === "loading"} onClick={loadMore} type="button">
          {state === "loading" ? "Đang mở thêm…" : state === "error" ? "Thử mở lại" : view === "ngay-thang" && !date ? "Xem thêm ngày" : "Xem thêm kỷ niệm"}
        </button>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {state === "error" ? "Chưa mở được ảnh mới. Chạm Thử mở lại." : `${memories.length} ảnh đang hiển thị.`}
      </p>
      {activeIndex != null && memories[activeIndex] ? (
        <PhotoViewer index={activeIndex} memory={memories[activeIndex]} onClose={() => setActiveIndex(null)} onMove={moveViewer} total={memories.length} />
      ) : null}
    </>
  );
}
