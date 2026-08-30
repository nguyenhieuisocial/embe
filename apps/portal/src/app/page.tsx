const timelinePreview = [
  { date: "Hôm nay", text: "Những câu chuyện mới sẽ xuất hiện ở đây." },
  { date: "Tháng này", text: "Các cột mốc được bố mẹ chọn để cả nhà cùng nhớ." }
];

export default function Home() {
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

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">NHẬT KÝ ĐẦU ĐỜI</p>
          <h1>Một nơi để cả nhà cùng dõi theo hành trình của em bé</h1>
          <p className="intro">
            Từng ngày nhỏ, từng thay đổi dịu dàng và những khoảnh khắc muốn giữ
            thật lâu — được gom lại trong một nơi dễ xem trên điện thoại.
          </p>
        </div>

        <div className="orbit" aria-hidden="true">
          <span className="orbit-ring" />
          <span className="orbit-seed">✦</span>
          <span className="orbit-label">mỗi ngày một chút lớn hơn</span>
        </div>
      </section>

      <p className="approval-message">
        Chỉ những điều bố mẹ đã chọn mới xuất hiện tại đây.
      </p>

      <section className="portal-grid" aria-label="Nội dung gia đình">
        <article className="panel timeline-panel">
          <div className="panel-heading">
            <p className="panel-kicker">THEO DÒNG THỜI GIAN</p>
            <h2>Nhật ký</h2>
          </div>
          <div className="timeline-list">
            {timelinePreview.map((item) => (
              <div className="timeline-item" key={item.date}>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="timeline-date">{item.date}</p>
                  <p>{item.text}</p>
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

