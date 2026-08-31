import Image from "next/image";
import { Suspense } from "react";

import AppHeader from "../components/app-header";
import { Icon } from "../components/embe-icon";
import { getTimeline, getTimelineFreshness } from "../lib/timeline";

export const dynamic = "force-dynamic";

const dayBeats = [
  { when: "Sáng", title: "Mẹ Ngân xem việc hôm nay", href: "/me-bau" },
  { when: "Trong ngày", title: "Ba Hiếu ghi một điều đáng nhớ", href: "/ghi-lai" },
  { when: "Tối", title: "Cả nhà thảnh thơi nghỉ ngơi", href: null }
];

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
    kicker: "BỈM · SỮA · VẬT TƯ",
    title: "Biết món nào sắp hết",
    label: "Xem đồ dùng trong nhà"
  },
  {
    href: "/tro-ly",
    icon: "assistant" as const,
    kicker: "CHẠY TẠI MÁY NHÀ",
    title: "Hỏi về giấc ngủ và bú sữa",
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

        <a className="action-primary" href="/me-bau" aria-label="Mở trang Mẹ bầu hôm nay">
          Xem việc hôm nay
          <Icon name="arrow" className="icon" />
        </a>

        <div className="family-hero-art">
          <Image
            src="/illustrations/family-thread-hero.webp"
            alt=""
            width={1280}
            height={853}
            sizes="(max-width: 767px) 100vw, 560px"
            priority
          />
        </div>
      </section>

      <section className="section day-thread" aria-labelledby="day-thread-title">
        <div className="section-head">
          <p className="panel-kicker">MỖI NGÀY BA NHỊP</p>
          <h2 id="day-thread-title">Ba nhịp nhẹ nhàng</h2>
        </div>
        <div className="thread">
          {dayBeats.map((beat) => (
            <div className="thread-item" key={beat.when}>
              <span className="thread-node" aria-hidden="true" />
              <div className="thread-body">
                <p className="thread-when">{beat.when}</p>
                {beat.href ? <a href={beat.href}>{beat.title}</a> : <strong>{beat.title}</strong>}
              </div>
            </div>
          ))}
        </div>
      </section>

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
