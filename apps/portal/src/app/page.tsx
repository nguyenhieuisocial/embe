import Link from "next/link";
import { Suspense } from "react";

import AppHeader from "../components/app-header";
import DailyShortcuts from "../components/daily-shortcuts";
import { Icon } from "../components/embe-icon";
import JournalCaption from "../components/journal-caption";
import StageToday from "../components/stage-today";
import TodayPrioritiesPanel from "../components/today-priorities-panel";
import { getPendingJournalEntries, getTimeline, getTimelineFreshness } from "../lib/timeline";
import { dateInVietnam } from "../lib/family-task-contract";
import { getTodaySnapshot } from "../lib/today-server";

export const dynamic = "force-dynamic";

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
    getTimeline(3),
    getPendingJournalEntries(3),
    getTimelineFreshness()
  ]);
  const timeline = [...pending, ...published]
    .sort((left, right) => new Date(right.eventAt).getTime() - new Date(left.eventAt).getTime())
    .slice(0, 3);

  return (
    <section className="section timeline-panel" aria-labelledby="timeline-title">
      <div className="section-head">
        <h2 id="timeline-title">Gần đây của nhà mình</h2>
        <Link className="journal-all-link" href="/nhat-ky" prefetch={false} aria-label="Xem toàn bộ nhật ký">Xem tất cả</Link>
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
          <Link className="btn btn-quiet" href="/ghi-lai" prefetch={false}>Ghi điều đầu tiên</Link>
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
        <h2>Gần đây của nhà mình</h2>
        <Link className="journal-all-link" href="/nhat-ky" prefetch={false} aria-label="Xem toàn bộ nhật ký">Xem tất cả</Link>
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
    <main className="page today-main">
      <AppHeader note="Chỉ gia đình nhìn thấy" />

      <section className="today-hero">
        <div className="today-meta">
          <time dateTime={dateInVietnam()}>{todayLabel}</time>
        </div>
        <h1 aria-label="Hôm nay">Hôm nay</h1>
        <p className="intro">Một ngày nhẹ nhàng cùng nhà mình.</p>

      </section>

      <Suspense fallback={<section className="section today-priorities skeleton" aria-label="Đang mở những việc cần để ý"><span className="skeleton-line" /><span className="skeleton-line" /></section>}>
        <SmartTodayPanel />
      </Suspense>

      <DailyShortcuts />
      <StageToday />

      <Suspense fallback={<TimelineLoading />}>
        <TimelinePanel />
      </Suspense>
    </main>
  );
}
