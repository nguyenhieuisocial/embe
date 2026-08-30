import { getTimeline } from "../lib/timeline";

export const dynamic = "force-dynamic";

const emptyTimeline = [
  { id: "empty", eventAt: "", title: "Những câu chuyện mới sẽ xuất hiện ở đây.", caption: "Bố mẹ chỉ cần thêm #portal vào ghi chú muốn chia sẻ." }
];

function vietnameseDate(value: string): string {
  if (!value) return "Sẵn sàng";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export default async function Home() {
  const liveTimeline = await getTimeline();
  const timeline = liveTimeline.length > 0 ? liveTimeline : emptyTimeline;
  return (
    <main>
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Em Bé — về đầu trang">
          Em Bé
        </a>
        <p className="privacy-note">
          <span aria-hidden="true">●</span> Không gian riêng của gia đình
        </p>
      </header>

      <section className="hero home-hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">EM BÉ · MỖI NGÀY BÊN NHAU</p>
          <h1 aria-label="Hôm nay, mình cần làm gì?">Hôm nay,<br /><em>mình cần làm gì?</em></h1>
          <p className="intro">
            Một nơi duy nhất để mẹ xem việc cần làm, cả nhà lưu điều đáng nhớ
            và cùng dõi theo em bé lớn lên.
          </p>
          <a className="primary-link" href="/me-bau">
            Mở việc của mẹ hôm nay <span aria-hidden="true">→</span>
          </a>
        </div>

        <div className="day-ribbon" aria-label="Ba nhịp đơn giản trong ngày">
          <p className="day-ribbon-title">Nhịp của một ngày</p>
          <ol>
            <li><span>Sáng</span><strong>Mẹ Ngân xem việc hôm nay</strong></li>
            <li><span>Trong ngày</span><strong>Ba Hiếu ghi một điều đáng nhớ</strong></li>
            <li><span>Tối</span><strong>Thảnh thơi nghỉ ngơi</strong></li>
          </ol>
          <p className="day-ribbon-note">Những phần kỹ thuật đã có hệ thống lo.</p>
        </div>
      </section>

      <p className="approval-message">
        Chỉ những điều bố mẹ đã chọn mới xuất hiện tại đây.
      </p>

      <a className="guide-entry" href="/huong-dan" aria-label="Xem cách sử dụng đơn giản">
        <span className="guide-entry-mark" aria-hidden="true">?</span>
        <span>
          <small>DÀNH CHO CẢ NHÀ</small>
          <strong>Dùng Em Bé thật đơn giản</strong>
          <p>Chỉ một trang, mỗi ngày ba việc.</p>
        </span>
        <span aria-hidden="true">→</span>
      </a>

      <a className="pregnancy-entry" href="/me-bau" aria-label="Mở trang Mẹ bầu hôm nay">
        <span>
          <small>VIỆC QUAN TRỌNG NHẤT</small>
          <strong>Checklist và thực đơn của mẹ</strong>
        </span>
        <span aria-hidden="true">→</span>
      </a>

      <section className="portal-grid" aria-label="Nội dung gia đình">
        <article className="panel timeline-panel">
          <div className="panel-heading">
            <p className="panel-kicker">THEO DÒNG THỜI GIAN</p>
            <h2>Nhật ký</h2>
          </div>
          <div className="timeline-list">
            {timeline.map((item) => (
              <div className="timeline-item" key={item.id}>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="timeline-date">{vietnameseDate(item.eventAt)}</p>
                  <strong>{item.title}</strong>
                  <p>{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel gallery-panel">
          <div className="panel-heading">
            <p className="panel-kicker">ALBUM GIA ĐÌNH</p>
            <h2>Khoảnh khắc</h2>
          </div>
          <div className="photo-placeholder" aria-label="Album sẽ xuất hiện sau khi bố mẹ chọn ảnh">
            <span className="photo-mark" aria-hidden="true">◎</span>
            <p>Ảnh đã chọn sẽ được đặt ở đây</p>
          </div>
        </article>
      </section>

      <footer>
        <p>Được lưu giữ riêng tư cho gia đình.</p>
      </footer>
    </main>
  );
}
