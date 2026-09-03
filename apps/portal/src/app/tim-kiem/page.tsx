import Link from "next/link";

import AppHeader from "../../components/app-header";
import { normalizeFamilySearch, searchFamilyContent } from "../../lib/family-search";

export const dynamic = "force-dynamic";

function dayKey(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh", year: "numeric"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.q === "string" ? params.q : "";
  const query = normalizeFamilySearch(raw);
  const results = query ? await searchFamilyContent(query) : { memories: [], journal: [], health: [] };
  const total = results.memories.length + results.journal.length + results.health.length;

  return (
    <main className="page family-search-main">
      <AppHeader note="Chỉ tìm trong dữ liệu gia đình" />
      <section className="family-search-hero">
        <p className="eyebrow">Tìm lại thật nhanh</p>
        <h1>Kỷ niệm nào<br /><em>mình đang nhớ?</em></h1>
        <p className="intro">Tìm theo ngày, album, địa điểm hoặc lời đã ghi; cả hồ sơ khám và cột mốc.</p>
      </section>

      <form action="/tim-kiem" className="family-search-form" role="search">
        <label htmlFor="family-search">Tìm trong EmBe</label>
        <div>
          <input autoComplete="off" defaultValue={raw} enterKeyHint="search" id="family-search" inputMode="search" maxLength={60} name="q" placeholder="Ví dụ: Đà Lạt, 23/12/2025…" type="search" />
          <button type="submit">Tìm</button>
        </div>
      </form>

      {raw && !query ? <p className="family-search-hint" role="alert">Nhập ít nhất 2 ký tự để tìm.</p> : null}
      {query ? <p className="family-search-count" role="status">{total ? `${total} kết quả cho “${query}”` : `Chưa tìm thấy “${query}”`}</p> : null}

      {results.memories.length ? (
        <section className="family-search-section" aria-labelledby="search-memory-title">
          <div className="section-head"><p className="panel-kicker">Trong album</p><h2 id="search-memory-title">Ảnh và chuyến đi</h2></div>
          <div className="family-search-photos">
            {results.memories.map((memory) => (
              <a href={`/ky-niem?view=ngay-thang&date=${dayKey(memory.eventAt)}`} key={memory.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={memory.title} height={memory.height ?? 900} src={`/api/media/${memory.id}`} width={memory.width ?? 1200} />
                <span><strong>{memory.title}</strong><small>{memory.albumTitle} · {dateLabel(memory.eventAt)}</small></span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {results.journal.length ? (
        <section className="family-search-section" aria-labelledby="search-journal-title">
          <div className="section-head"><p className="panel-kicker">Trong lời đã ghi</p><h2 id="search-journal-title">Nhật ký</h2></div>
          <div className="family-search-journal">
            {results.journal.map((entry) => (
              <Link href="/#timeline-title" key={entry.id}>
                <time dateTime={entry.eventAt}>{dateLabel(entry.eventAt)}</time>
                <strong>{entry.title}</strong><p>{entry.caption}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {results.health.length ? <section className="family-search-section" aria-labelledby="search-health-title"><div className="section-head"><p className="panel-kicker">Trong hồ sơ Mẹ & Bé</p><h2 id="search-health-title">Khám, tiêm và cột mốc</h2></div><div className="family-search-journal">{results.health.map((item) => <Link href={item.source === "pregnancy" ? "/me-bau/ho-so#ho-so-kham" : item.source === "milestone" ? "/be/phat-trien" : "/be/ho-so"} key={`${item.source}-${item.id}`}><time dateTime={item.occurredAt}>{dateLabel(item.occurredAt)}</time><strong>{item.title}</strong><p>{[item.provider, item.notes].filter(Boolean).join(" · ")}</p></Link>)}</div></section> : null}

      {query && !total ? <div className="empty-state family-search-empty"><strong>Chưa thấy điều này</strong><p>Thử tên album, thành phố, một từ trong lời nhắn hoặc ngày theo dạng 23/12/2025.</p></div> : null}
    </main>
  );
}
