import Image from "next/image";
import { Suspense } from "react";

import AppHeader from "../components/app-header";
import { Icon } from "../components/embe-icon";
import { getTimeline, getTimelineFreshness } from "../lib/timeline";
import { dateInVietnam, LINK_DETAILS } from "../lib/family-task-contract";
import { getFamilyTasks } from "../lib/family-tasks-server";

export const dynamic = "force-dynamic";

const shortcuts = [
  {
    href: "/ky-niem",
    icon: "album" as const,
    kicker: "ALBUM GIA ĐÌNH",
    title: "Khoảnh khắc",
    label: "Mở album kỷ niệm"
  },
  {
    href: "/do-dung",
    icon: "supply" as const,
    kicker: "CHUẨN BỊ TỪNG CHÚT",
    title: "Đồ cần cho mẹ và em bé",
    label: "Xem đồ dùng trong nhà"
  },
  {
    href: "/tro-ly",
    icon: "assistant" as const,
    kicker: "ĐÚNG GIAI ĐOẠN HIỆN TẠI",
    title: "Mẹ Ngân cần gì lúc này?",
    label: "Hỏi trợ lý riêng của gia đình"
  },
  {
    href: "/huong-dan",
    icon: "guide" as const,
    kicker: "DÀNH CHO CẢ NHÀ",
    title: "Dùng EmBe thật đơn giản",
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
        <p className="panel-kicker">THEO DÒNG THỜI GIAN</p>
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
        <p className="panel-kicker">THEO DÒNG THỜI GIAN</p>
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
  const tasks = await getFamilyTasks(today, today).catch(() => []);
  const completed = tasks.filter((task) => task.completed).length;

  return (
    <section className="section day-thread" aria-labelledby="day-thread-title">
      <div className="section-head">
        <p className="panel-kicker">VIỆC NHÀ MÌNH HÔM NAY</p>
        <h2 id="day-thread-title">{tasks.length ? `${completed}/${tasks.length} việc đã xong` : "Một ngày đang thật nhẹ"}</h2>
      </div>
      {tasks.length ? <div className="thread">
        {tasks.slice(0, 4).map((task) => {
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
        <strong>Chưa có việc nào</strong><p>Thêm việc đầu tiên để Mẹ Ngân và Ba Hiếu cùng theo dõi.</p>
      </div>}
      <a className="btn btn-quiet btn-block" href="/ke-hoach">Mở toàn bộ kế hoạch</a>
    </section>
  );
}

export default function Home() {
  return (
    <main className="page">
      <AppHeader note="Chỉ gia đình nhìn thấy" />

      <section className="today-hero">
        <p className="eyebrow">SỔ NHÀ NGÂN &amp; HIẾU</p>
        <h1 aria-label="Hôm nay, mình cần làm gì?">
          Hôm nay,<br /><em>mình cần làm gì?</em>
        </h1>
        <p className="intro">
          Một nơi duy nhất để mẹ xem việc cần làm, cả nhà lưu điều đáng nhớ và
          cùng dõi theo em bé lớn lên.
        </p>

        <a className="action-primary" href="/ke-hoach" aria-label="Mở kế hoạch hôm nay">
          Xem việc hôm nay
          <Icon name="arrow" className="icon" />
        </a>

      </section>

      <section className="section pregnancy-chapter" aria-labelledby="pregnancy-chapter-title">
        <div className="chapter-thread" aria-hidden="true"><span /></div>
        <div>
          <p className="panel-kicker">ĐANG MANG THAI</p>
          <h2 id="pregnancy-chapter-title">Mới mang thai, mình đi từng tuần</h2>
          <p>Ưu tiên sức khỏe Mẹ Ngân, việc cần làm hôm nay và những câu hỏi cho lần khám tới. Các công cụ chăm em bé sẽ xuất hiện đúng lúc sau sinh.</p>
        </div>
        <div className="chapter-actions">
          <a href="/me-bau">Chăm sóc hôm nay</a>
          <a href="/lich" aria-label="Mở lịch gia đình">Mở lịch</a>
        </div>
      </section>

      <div className="section family-hero-art" aria-hidden="true">
        <Image
          src="/illustrations/family-thread-hero.webp"
          alt=""
          width={1280}
          height={853}
          sizes="(max-width: 767px) 100vw, 560px"
          unoptimized
        />
      </div>

      <Suspense fallback={<section className="section day-thread skeleton" aria-label="Đang mở kế hoạch hôm nay"><span className="skeleton-line" /><span className="skeleton-line" /></section>}>
        <TodayPlanPanel />
      </Suspense>

      <Suspense fallback={<TimelineLoading />}>
        <TimelinePanel />
      </Suspense>

      <nav className="section shortcut-list" aria-label="Lối tắt của gia đình">
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

      <p className="privacy-line">Chỉ những điều bố mẹ đã chọn mới xuất hiện tại đây.</p>

      <footer>
        <p>Được lưu giữ riêng tư cho gia đình.</p>
      </footer>
    </main>
  );
}
