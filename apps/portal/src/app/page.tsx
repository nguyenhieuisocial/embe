import { Suspense } from "react";

import AppHeader from "../components/app-header";
import { Icon } from "../components/embe-icon";
import StageToday from "../components/stage-today";
import { getTimeline, getTimelineFreshness } from "../lib/timeline";
import { dateInVietnam, LINK_DETAILS } from "../lib/family-task-contract";
import { getFamilyTasks } from "../lib/family-tasks-server";

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
  const [timeline, freshness] = await Promise.all([getTimeline(), getTimelineFreshness()]);

  return (
    <section className="section timeline-panel" aria-labelledby="timeline-title">
      <div className="section-head">
        <p className="panel-kicker">Theo dòng thời gian</p>
        <h2 id="timeline-title">Nhật ký</h2>
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
                <p>{item.caption}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true"><Icon name="write" /></span>
          <strong>Chưa có ghi chép nào</strong>
          <p>Điều đầu tiên cả nhà ghi lại sẽ xuất hiện ở đây.</p>
          <a className="btn btn-quiet" href="/ghi-lai">Ghi điều đầu tiên</a>
        </div>
      )}

      <p className="freshness" role="status">{freshnessNote[freshness]}</p>
    </section>
  );
}

function TimelineLoading() {
  return (
    <section className="section timeline-panel" aria-busy="true">
      <div className="section-head">
        <p className="panel-kicker">Theo dòng thời gian</p>
        <h2>Nhật ký</h2>
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

async function TodayPlanPanel() {
  const today = dateInVietnam();
  const tasks = (await getFamilyTasks(today, today).catch(() => [])).sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1;
    const priority = (category: string) => category === "appointment" ? 0 : category === "health" ? 1 : category === "pregnancy" ? 2 : 3;
    const categoryOrder = priority(left.category) - priority(right.category);
    return categoryOrder || (left.dueTime ?? "99:99").localeCompare(right.dueTime ?? "99:99");
  });
  const completed = tasks.filter((task) => task.completed).length;

  return (
    <section className="section day-thread" aria-labelledby="day-thread-title">
      <div className="section-head">
        <p className="panel-kicker">Việc nhà mình hôm nay</p>
        <h2 id="day-thread-title">{tasks.length ? `${completed}/${tasks.length} việc đã xong` : "Hôm nay chưa có việc"}</h2>
      </div>
      {tasks.length ? <div className="thread">
        {tasks.slice(0, 3).map((task) => {
          const target = LINK_DETAILS[task.linkTarget];
          return <div className={`thread-item${task.completed ? " is-complete" : ""}`} key={task.id}>
            <span className="thread-node" aria-hidden="true" />
            <div className="thread-body">
              <p className="thread-when">{task.dueTime ?? "Cả ngày"}</p>
              <a href={target.href || "/ke-hoach"}>{task.title}</a>
            </div>
          </div>;
        })}
      </div> : <div className="empty-state compact-empty">
        <strong>Có thể bắt đầu thật nhẹ</strong><p>Thêm lịch khám, việc cần làm hoặc điều Ba Hiếu hỗ trợ.</p>
      </div>}
      <a className="btn btn-quiet btn-block" href="/ke-hoach">Mở toàn bộ kế hoạch</a>
    </section>
  );
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
        <h1 aria-label="Hôm nay, mình cần làm gì?">
          Hôm nay,<br /><em>mình cần làm gì?</em>
        </h1>
        <p className="intro">
          Việc ưu tiên, lịch sắp tới và điều đáng nhớ.
        </p>

        <a className="action-primary" href="/ke-hoach" aria-label="Mở kế hoạch hôm nay">
          Xem việc ưu tiên
          <Icon name="arrow" className="icon" />
        </a>

      </section>

      <StageToday />

      <Suspense fallback={<section className="section day-thread skeleton" aria-label="Đang mở kế hoạch hôm nay"><span className="skeleton-line" /><span className="skeleton-line" /></section>}>
        <TodayPlanPanel />
      </Suspense>

      <nav className="section shortcut-list home-shortcuts" aria-label="Lối tắt của gia đình">
        <div className="home-shortcuts-heading">
          <p className="panel-kicker">Đi thẳng đến nơi cần dùng</p>
          <h2>Mở nhanh</h2>
        </div>
        {shortcuts.map((shortcut) => (
          <a className="shortcut" href={shortcut.href} key={shortcut.href} aria-label={shortcut.label}>
            <span className="shortcut-mark" aria-hidden="true"><Icon name={shortcut.icon} /></span>
            <span className="shortcut-text">
              <small>{shortcut.kicker}</small>
              <strong>{shortcut.title}</strong>
            </span>
            <Icon name="arrow" className="icon icon-chevron" />
          </a>
        ))}
      </nav>

      <Suspense fallback={<TimelineLoading />}>
        <TimelinePanel />
      </Suspense>
    </main>
  );
}
