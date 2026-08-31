import Image from "next/image";
import { Suspense } from "react";

import AppHeader from "../../components/app-header";
import MemoryGrid, { type MemoryView } from "../../components/memory-grid";
import MemoryTabs from "../../components/memory-tabs";
import PhotoComposer from "../../components/photo-composer";
import { dayRange, lunarDateLong, parseDateKey } from "../../lib/calendar";
import { getMediaAlbums, getMediaMemories } from "../../lib/media";

export const dynamic = "force-dynamic";

export async function MemoryGallery({ album, date, view = "album" }: { album?: string; date?: string; view?: MemoryView } = {}) {
  const range = date ? dayRange(date) : null;
  const albums = await getMediaAlbums();
  const selectedAlbum = album && albums.some((item) => item.key === album) ? album : undefined;
  const memories = await getMediaMemories({ album: selectedAlbum, limit: 24, ...range });

  return memories.length || albums.length ? (
    <MemoryGrid album={selectedAlbum} albums={albums} initial={memories} date={date} initialView={view} />
  ) : (
    <section className="memory-empty" role="status">
      <Image
        src="/illustrations/memory-album-empty.webp"
        alt=""
        aria-hidden="true"
        width={900}
        height={675}
        sizes="(max-width: 720px) 84vw, 420px"
      />
      <h2>{date ? "Ngày này chưa có kỷ niệm" : "Chưa có ảnh được chọn"}</h2>
      <p>{date ? "Mình có thể chọn một ngày khác trên lịch hoặc lưu lại khoảnh khắc mới." : "Mẹ Ngân hoặc Ba Hiếu chọn ảnh trong album gia đình trước. EmBe sẽ tự đưa bản xem nhẹ vào đây sau khi đồng bộ."}</p>
      <a href={date ? "/lich" : "/huong-dan#iphone-title"}>{date ? "Trở lại lịch gia đình" : "Xem cách đưa ảnh từ iPhone"}</a>
    </section>
  );
}

function MemoryLoading() {
  return (
    <section className="memory-loading" role="status" aria-busy="true">
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <p>Đang mở album riêng của gia đình…</p>
    </section>
  );
}

export default async function MemoriesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const dateValue = typeof query.date === "string" ? query.date : undefined;
  const selectedDate = parseDateKey(dateValue);
  const viewValue = typeof query.view === "string" ? query.view : undefined;
  const view: MemoryView = viewValue === "ngay-thang" || viewValue === "chuyen-di" || viewValue === "ban-do"
    ? viewValue
    : selectedDate ? "ngay-thang" : "album";
  const albumValue = typeof query.album === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(query.album) && query.album.length <= 64
    ? query.album
    : undefined;
  const date = selectedDate && dateValue ? dateValue : undefined;
  const dateHeading = selectedDate ? new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(selectedDate) : null;

  return (
    <main className="memories-main">
      <AppHeader note="Chỉ ảnh bố mẹ đã chọn" />
      <section className="memories-hero">
        <p className="eyebrow">ALBUM CỦA GIA ĐÌNH</p>
        <h1>Những ngày<br /><em>mình muốn nhớ</em></h1>
        <p className="intro">{dateHeading ? `Những điều mình đã lưu trong ${dateHeading}.` : "Mỗi album đi theo đúng folder đã chọn trong kho ảnh gia đình; ảnh gốc vẫn an toàn ở máy nhà."}</p>
      </section>
      <PhotoComposer />
      <MemoryTabs current="album" />
      {selectedDate ? (
        <section className="selected-date-card" aria-label="Ngày đang xem">
          <div>
            <span>NGÀY ĐANG XEM</span>
            <strong>{dateHeading}</strong>
            <small>{lunarDateLong(selectedDate)}</small>
          </div>
          <a href="/ky-niem">Xem tất cả</a>
        </section>
      ) : null}
      <Suspense fallback={<MemoryLoading />}>
        <MemoryGallery album={albumValue} date={date} view={view} />
      </Suspense>
    </main>
  );
}
