import Link from "next/link";
import { Suspense } from "react";

import AppHeader from "../components/app-header";
import { Icon } from "../components/embe-icon";
import JournalCaption from "../components/journal-caption";
import StageToday from "../components/stage-today";
import TodayPrioritiesPanel from "../components/today-priorities-panel";
import { getPendingJournalEntries, getTimeline, getTimelineFreshness } from "../lib/timeline";
import { dateInVietnam } from "../lib/family-task-contract";
import { getTodaySnapshot } from "../lib/today-server";

export const dynamic = "force-dynamic";

const shortcuts = [
  {
    href: "/ky-niem",
    icon: "album" as const,
    kicker: "Ảnh & chuyến đi",
    title: "Kỷ niệm",
    label: "Mở album kỷ niệm"
  },
  {
    href: "/do-dung",
    icon: "supply" as const,
    kicker: "Theo dõi số lượng",
    title: "Đồ dùng",
    label: "Xem đồ dùng trong nhà"
  },
  {
    href: "/tro-ly",
    icon: "assistant" as const,
    kicker: "Theo tuần thai",
    title: "Trợ lý",
    label: "Hỏi trợ lý riêng của gia đình"
  },
  {
    href: "/huong-dan",
    icon: "guide" as const,
    kicker: "Cài trên iPhone",
    title: "Hướng dẫn",
    label: "Xem cách sử dụng đơn giản"
  }
];

const freshnessNote = {
  fresh: "Nhật ký vừa được cập nhật.",
  stale: "Nhật ký đang tạm cập nhật. Những nội dung cũ vẫn an toàn.",
  unavailable: "Chưa kết nối được với máy nhà. Những nội dung cũ vẫn an toàn."
} as const;

function vietnameseDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

async function TimelinePanel() {
  const [published, pending, freshness] = await Promise.all([
    getTimeline(20),
    getPendingJournalEntries(20),
    getTimelineFreshness()
  ]);
  const timeline = [...pending, ...published]
    .sort((left, right) => new Date(right.eventAt).getTime() - new Date(left.eventAt).getTime())
    .slice(0, 20);

  return (
    <section className="section timeline-panel" aria-labelledby="timeline-title">
      <div className="section-head">
        <div><p className="panel-kicker">Theo dòng thời gian</p><h2 id="timeline-title">Nhật ký</h2></div>
        <Link className="journal-all-link" href="/nhat-ky" aria-label="Xem toàn bộ nhật ký">Xem tất cả</Link>
      </div>

      {timeline.length > 0 ? (
        <div className="thread">
          {timeline.map((item) => (
            <div className="thread-item" key={item.id}>
              <span className="thread-node" aria-hidden="true" />
              <div className="thread-body">
                <p className="timeline-date">
                  <time dateTime={item.eventAt}>{vietnameseDate(item.eventAt)}</time>
                </p>
                <strong>{item.title}</strong>
                <JournalCaption caption={item.caption} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true"><Icon name="write" /></span>
          <strong>Chưa có ghi chép nào</strong>
          <p>Điều đầu tiên cả nhà ghi lại sẽ xuất hiện ở đây.</p>
          <Link className="btn btn-quiet" href="/ghi-lai">Ghi điều đầu tiên</Link>
        </div>
      )}

      <p className="freshness" role="status">
        {pending.length ? "Ghi chép mới đang được đồng bộ." : freshnessNote[freshness]}
      </p>
    </section>
  );
}

function TimelineLoading() {
  return (
    <section className="section timeline-panel" aria-busy="true">
      <div className="section-head">
        <div><p className="panel-kicker">Theo dòng thời gian</p><h2>Nhật ký</h2></div>
        <Link className="journal-all-link" href="/nhat-ky" aria-label="Xem toàn bộ nhật ký">Xem tất cả</Link>
      </div>
      <div className="skeleton" role="status">
        <span className="skeleton-line is-short" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <p className="freshness">Đang mở nhật ký của gia đình…</p>
      </div>
    </section>
  );
}

async function SmartTodayPanel() {
  const snapshot = await getTodaySnapshot();
  return <TodayPrioritiesPanel priorities={snapshot.priorities} unavailableSources={snapshot.unavailableSources} />;
}

export default function Home() {
  const todayLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date());

  return (
    <main className="page">
      <AppHeader note="Chỉ gia đình nhìn thấy" />

      <section className="today-hero">
        <div className="today-meta">
          <p className="eyebrow">Sổ nhà Ngân &amp; Hiếu</p>
          <time dateTime={dateInVietnam()}>{todayLabel}</time>
        </div>
        <h1 aria-label="Hôm nay">Hôm nay</h1>
        <p className="intro">Mình chỉ cần để ý vài điều quan trọng.</p>

      </section>

      <Suspense fallback={<section className="section today-priorities skeleton" aria-label="Đang mở những việc cần để ý"><span className="skeleton-line" /><span className="skeleton-line" /></section>}>
        <SmartTodayPanel />
      </Suspense>

      <StageToday />

      <nav className="section shortcut-list home-shortcuts" aria-label="Lối tắt của gia đình">
        <div className="home-shortcuts-heading">
          <p className="panel-kicker">Đi thẳng đến nơi cần dùng</p>
          <h2>Mở nhanh</h2>
        </div>
        {shortcuts.map((shortcut) => (
          <Link className="shortcut" href={shortcut.href} key={shortcut.href} aria-label={shortcut.label}>
            <span className="shortcut-mark" aria-hidden="true"><Icon name={shortcut.icon} /></span>
            <span className="shortcut-text">
              <small>{shortcut.kicker}</small>
              <strong>{shortcut.title}</strong>
            </span>
            <Icon name="arrow" className="icon icon-chevron" />
          </Link>
        ))}
      </nav>

      <Suspense fallback={<TimelineLoading />}>
        <TimelinePanel />
      </Suspense>
    </main>
  );
}
