"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { groupByDay, groupIntoTrips } from "../lib/memory-groups";
import type { MediaAlbum, MediaMemory } from "../lib/media";
import { toLocalDateTime } from "../lib/photo-metadata";
import { readDeviceRole } from "../lib/device-preferences";
import PhotoShareButton from "./photo-share-button";
import PhotoDownloadButton from "./photo-download-button";
import ViewportImage from "./viewport-image";
import AutoLoadMore from "./auto-load-more";
import PhotoViewerImage from "./photo-viewer-image";
import { trapViewerFocus } from "./viewer-focus";

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
        <ViewportImage alt={memory.title} eager={featured} height={memory.height ?? 900}
          src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("original");
  const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLocaleLowerCase("vi");
  const visible = albums.filter(item => fold(item.title).includes(fold(query.trim())));
  if (sort === "name") visible.sort((a, b) => a.title.localeCompare(b.title, "vi"));
  if (sort === "count") visible.sort((a, b) => b.count - a.count);
  return (
    <>
    <div className="album-browser-tools">
      <label>Tìm album<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tên album, chuyến đi…" /></label>
      <label>Sắp xếp<select value={sort} onChange={event => setSort(event.target.value)}><option value="original">Thứ tự gia đình</option><option value="name">Tên A–Z</option><option value="count">Nhiều ảnh nhất</option></select></label>
    </div>
    <p className="album-browser-count" role="status">{visible.length} album{query.trim() ? ` phù hợp / ${albums.length}` : ""}</p>
    {!visible.length ? <div className="album-search-empty"><p>Không tìm thấy album phù hợp.</p>{query ? <button type="button" onClick={() => setQuery("")}>Xóa tìm kiếm</button> : null}</div> : null}
    <section className="memory-albums" aria-label="Các album theo folder gia đình">
      {visible.map((album, albumIndex) => (
        <Link className="memory-album" href={`/ky-niem?view=album&album=${encodeURIComponent(album.key)}`} key={album.key}>
          <span className="memory-album-covers" aria-hidden="true">
            {album.covers.slice(0, 1).map((cover) => (
              <ViewportImage alt="" eager={albumIndex === 0}
                height={cover.height ?? 900} key={cover.id} src={`/api/media/${cover.id}`} width={cover.width ?? 1200} />
            ))}
          </span>
          <span className="memory-album-copy"><strong>{album.title}</strong><small>{album.count.toLocaleString("vi-VN")} ảnh đã chọn</small></span>
          <span className="memory-album-arrow" aria-hidden="true">›</span>
        </Link>
      ))}
    </section>
    </>
  );
}

function DayAlbumOverview({ memories }: { memories: MediaMemory[] }) {
  return (
    <section className="memory-day-albums" aria-label="Album kỷ niệm theo ngày">
      {groupByDay(memories).map((group, index) => {
        const cover = group.memories[0];
        return (
          <Link
            aria-label={`Mở album ${group.title}`}
            className="memory-day-album"
            href={`/ky-niem?view=ngay-thang&date=${group.key}`}
            key={group.key}
          >
            <ViewportImage alt="" eager={index === 0} height={cover.height ?? 900}
              src={`/api/media/${cover.id}`} width={cover.width ?? 1200} />
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
            <ViewportImage alt={memory.title} eager={index === 0} height={memory.height ?? 900}
              src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function PhotoViewer({ memory, index, total, onClose, onMove, onMetadataSaved }: {
  memory: MediaMemory;
  index: number;
  total: number;
  onClose: () => void;
  onMove: (direction: -1 | 1) => void;
  onMetadataSaved: (memory: MediaMemory) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState("");
  const [capturedAt, setCapturedAt] = useState(toLocalDateTime(memory.eventAt));
  const [locationName, setLocationName] = useState(memory.placeCity ?? "");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null | undefined>(undefined);

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

  useEffect(() => {
    setZoom(1);
    setEditing(false);
    setCapturedAt(toLocalDateTime(memory.eventAt));
    setLocationName(memory.placeCity ?? "");
    setCoordinates(undefined);
  }, [memory.id]);

  async function saveMetadata() {
    if (!capturedAt || savingMetadata) return;
    setSavingMetadata(true);
    setMetadataMessage("");
    try {
      const response = await fetch(`/api/memories/${memory.id}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ capturedAt: new Date(capturedAt).toISOString(),
          ...(coordinates === undefined ? {} : coordinates ?? { latitude: null, longitude: null }),
          locationName: locationName.trim() })
      });
      if (!response.ok) throw new Error("save failed");
      const result = await response.json() as { eventAt: string; placeCity: string | null };
      onMetadataSaved({ ...memory, eventAt: result.eventAt, placeCity: result.placeCity });
      setEditing(false);
    } catch {
      setMetadataMessage("Chưa lưu được. Hãy thử lại.");
    } finally {
      setSavingMetadata(false);
    }
  }

  function useViewerLocation() {
    if (!("geolocation" in navigator)) return setMetadataMessage("Điện thoại này chưa hỗ trợ lấy vị trí.");
    navigator.geolocation.getCurrentPosition((position) => {
      setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      if (!locationName) setLocationName("Vị trí hiện tại");
      setMetadataMessage("Đã lấy vị trí hiện tại.");
    }, () => setMetadataMessage("Chưa lấy được vị trí. Có thể nhập tên địa điểm."),
    { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 });
  }

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    trapViewerFocus(event);
  }

  return (
    <div ref={dialogRef} aria-label={memory.title} aria-modal="true" className="photo-viewer" role="dialog" onKeyDown={keepFocusInside}>
      <header>
        <span>Ảnh {index + 1} / {total}</span>
        <div className="photo-viewer-actions">
          <PhotoDownloadButton memory={memory} />
          <PhotoShareButton memory={memory} />
          {memory.editable ? <button aria-label="Sửa ngày giờ và vị trí" className="photo-viewer-edit" onClick={() => setEditing((value) => !value)} type="button">⌖</button> : null}
          <a aria-label="In ảnh này" className="photo-viewer-print" href={`/in-anh/${memory.id}`}>
            <span aria-hidden="true">▣</span><span className="photo-action-label">In ảnh</span>
          </a>
          <button ref={closeRef} aria-label="Đóng ảnh" className="photo-viewer-close" onClick={onClose} type="button">×</button>
        </div>
      </header>
      <PhotoViewerImage key={memory.id} src={`/api/media/${memory.id}`} title={memory.title} width={memory.width ?? 1200} height={memory.height ?? 900}
        total={total} onMove={onMove} onZoomChange={setZoom} />
      <footer>
        <div className="photo-viewer-caption"><time dateTime={memory.eventAt}>{dateLabel(memory.eventAt)}</time><strong>{memory.title}</strong><p>{memory.caption}</p></div>
        {editing ? <div className="photo-viewer-metadata">
          <label>Ngày và giờ chụp<input type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} /></label>
          <label>Vị trí<input maxLength={120} placeholder="Ví dụ: Đà Lạt, Lâm Đồng" value={locationName} onChange={(event) => { setLocationName(event.target.value); setCoordinates(null); }} /></label>
          <button onClick={useViewerLocation} type="button">Dùng vị trí hiện tại</button>
          <button disabled={savingMetadata || !capturedAt} onClick={saveMetadata} type="button">{savingMetadata ? "Đang lưu…" : "Lưu thay đổi"}</button>
          {metadataMessage ? <p role="alert">{metadataMessage}</p> : null}
        </div> : null}
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
  const [photoLayout, setPhotoLayout] = useState<"grid" | "full">("grid");
  const [view, setView] = useState<MemoryView>(initialView);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [state, setState] = useState<"ready" | "loading" | "error">("ready");
  const nextOffset = useRef(initial.length);
  const pendingPage = useRef<AbortController | null>(null);
  useEffect(() => () => pendingPage.current?.abort(), []);
  const selectedAlbumCount = albums.find((item) => item.key === album)?.count;

  async function loadMore() {
    if (pendingPage.current || !hasMore) return;
    const controller = new AbortController();
    pendingPage.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setState("loading");
    try {
      const params = new URLSearchParams({ offset: String(nextOffset.current), limit: String(PAGE_SIZE) });
      if (date) params.set("date", date);
      if (album) params.set("album", album);
      const response = await fetch(`/api/memories?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("load failed");
      const payload = await response.json() as { memories?: MediaMemory[]; hasMore?: boolean };
      if (!Array.isArray(payload.memories)) throw new Error("invalid response");
      // Advance by rows read, not by unique visible photos. A new upload can
      // shift offset pages; duplicates must not repeat frames or stall paging.
      nextOffset.current += payload.memories.length;
      setMemories((current) => [...new Map([...current, ...payload.memories!].map(memory => [memory.id, memory])).values()]);
      setHasMore(Boolean(payload.hasMore) && payload.memories.length > 0);
      setState("ready");
    } catch {
      setState("error");
    } finally {
      clearTimeout(timeout);
      pendingPage.current = null;
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
        {([ ["ngay-thang", "Ngày", "Ngày tháng"], ["chuyen-di", "Chuyến", "Chuyến đi"], ["ban-do", "Bản đồ", "Bản đồ"] ] as const).map(([nextView, label, accessibleLabel]) => album ? (
          // Leaving an album changes the server-side photo scope. A history-only
          // update would retain both its photos and its pagination filter.
          <Link key={nextView} aria-label={accessibleLabel} scroll={false}
            href={`/ky-niem?${new URLSearchParams({ view: nextView, ...(date ? { date } : {}) })}`}>{label}</Link>
        ) : (
          <button key={nextView} aria-label={accessibleLabel} aria-pressed={view === nextView}
            onClick={() => selectView(nextView)} type="button">{label}</button>
        ))}
      </nav>

      {view === "album" && !album ? <AlbumOverview albums={albums} /> : null}

      {view === "album" && album ? (
        <section className="memory-album-detail" aria-label={initial[0]?.albumTitle ?? "Album gia đình"}>
          <header><Link href="/ky-niem?view=album">‹ Tất cả album</Link><div><h2>{albums.find(item => item.key === album)?.title ?? initial[0]?.albumTitle ?? "Album gia đình"}</h2><p>{(selectedAlbumCount ?? memories.length).toLocaleString("vi-VN")} ảnh</p></div></header>
          <div className="album-layout-switch" role="group" aria-label="Bố cục ảnh"><button type="button" aria-pressed={photoLayout === "grid"} onClick={() => setPhotoLayout("grid")}>Lưới ảnh</button><button type="button" aria-pressed={photoLayout === "full"} onClick={() => setPhotoLayout("full")}>Nguyên khung</button></div>
          <div className="memory-album-grid" data-layout={photoLayout}>
            {memories.map((memory, index) => (
              <button aria-label={`Mở ảnh ${memory.title}`} key={memory.id} onClick={() => setActiveIndex(index)} type="button">
                <ViewportImage alt={memory.title} eager={index === 0} height={memory.height ?? 900}
                  src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
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
                <ViewportImage alt={trip.memories[0].title} height={trip.memories[0].height ?? 900}
                  src={`/api/media/${trip.memories[0].id}`} width={trip.memories[0].width ?? 1200} />
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
                        <ViewportImage alt={memory.title} height={memory.height ?? 900}
                          src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
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
      <AutoLoadMore hasMore={hasMore && !(view === "album" && !album)} loading={state === "loading"} error={state === "error"}
        paused={activeIndex !== null} pageKey={`${view}:${nextOffset.current}`} onLoadMore={loadMore} />
      <p className="sr-only" aria-live="polite">
        {state === "error" ? "Chưa mở được ảnh mới. Chạm Thử lại." : `${memories.length} ảnh đang hiển thị.`}
      </p>
      {activeIndex != null && memories[activeIndex] ? (
        <PhotoViewer index={activeIndex} memory={memories[activeIndex]} onClose={() => setActiveIndex(null)} onMove={moveViewer}
          onMetadataSaved={(updated) => setMemories((current) => current.map((item) => item.id === updated.id ? updated : item))}
          total={memories.length} />
      ) : null}
    </>
  );
}
