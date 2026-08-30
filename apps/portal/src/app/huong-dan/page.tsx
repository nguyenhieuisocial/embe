const dailyRhythm = [
  {
    moment: "Buổi sáng",
    title: "Mẹ Ngân xem việc hôm nay",
    detail: "Mở mục Mẹ bầu hôm nay, đọc nhanh và tích những việc Mẹ Ngân đã làm.",
    href: "/me-bau",
    action: "Mở việc hôm nay"
  },
  {
    moment: "Trong ngày",
    title: "Ba Hiếu ghi lại điều đáng nhớ",
    detail: "Một câu ngắn cũng đủ. Nhật ký và ảnh sẽ được gom vào dòng thời gian gia đình.",
    status: "Sẽ xuất hiện ngay tại Portal khi kết nối dữ liệu hoàn tất"
  },
  {
    moment: "Cuối ngày",
    title: "Yên tâm nghỉ ngơi",
    detail: "Bạn không cần mở trang giám sát hoặc tự kiểm tra hệ thống. Nếu trang Em Bé không mở, chỉ cần báo tôi.",
    status: "Không có việc phải làm"
  }
];

const plainRoles = [
  ["Chăm sóc", "Lưu bú, ngủ, tã và tăng trưởng."],
  ["Nhật ký", "Giữ cảm xúc, câu chuyện và cột mốc."],
  ["Đồ dùng", "Nhắc bỉm, sữa hoặc vật tư sắp hết."],
  ["Tự động", "Chuyển dữ liệu giữa các phần mà không cần nhập lại."],
  ["Canh hệ thống", "Báo khi một phần ngừng hoạt động."],
  ["Trợ lý riêng", "Tóm tắt dữ liệu bằng AI chạy trên máy nhà."]
];

export default function GuidePage() {
  return (
    <main className="guide-main">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Em Bé — về trang gia đình">
          Em Bé
        </a>
        <p className="privacy-note">
          <span aria-hidden="true">●</span> Một nơi để dùng mọi thứ
        </p>
      </header>

      <section className="guide-hero">
        <div>
          <p className="eyebrow">BẮT ĐẦU Ở ĐÂY</p>
          <h1>Bạn không cần học các ứng dụng phía sau</h1>
          <p className="intro">
            Từ giờ, hãy coi <strong>Em Bé</strong> là cánh cửa duy nhất. Những phần
            kỹ thuật tự lưu, tự chuyển và tự kiểm tra ở phía sau.
          </p>
        </div>
        <div className="one-door" aria-label="Một cánh cửa cho cả gia đình">
          <span>1</span>
          <p>trang duy nhất<br />bạn cần nhớ</p>
          <strong>embe.hieu.asia</strong>
        </div>
      </section>

      <section className="daily-rhythm" aria-labelledby="rhythm-title">
        <div className="rhythm-heading">
          <p className="panel-kicker">MỖI NGÀY CHỈ BA NHỊP</p>
          <h2 id="rhythm-title">Dùng như thế này là đủ</h2>
        </div>
        <div className="rhythm-list">
          {dailyRhythm.map((item, index) => (
            <article className="rhythm-item" key={item.moment}>
              <span className="rhythm-number" aria-hidden="true">{index + 1}</span>
              <div>
                <p className="rhythm-moment">{item.moment}</p>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                {item.href ? (
                  <a href={item.href}>{item.action} <span aria-hidden="true">→</span></a>
                ) : (
                  <small>{item.status}</small>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="iphone-setup" aria-labelledby="iphone-title">
        <div className="iphone-heading">
          <p className="panel-kicker">ẢNH TỰ VỀ MÁY NHÀ</p>
          <h2 id="iphone-title">Đưa ảnh từ iPhone vào Em Bé</h2>
          <p>Chỉ cần thiết lập một lần. Ảnh gốc không đi qua Vercel hay trang web công khai.</p>
        </div>
        <ol className="iphone-steps">
          <li>
            <span>1</span>
            <div>
              <strong><a href="https://apps.apple.com/us/app/tailscale/id1470499037">Cài Tailscale từ App Store</a></strong>
              <p>Đăng nhập cùng tài khoản gia đình và bật kết nối riêng.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong><a href="https://apps.apple.com/us/app/immich/id1613945652">Cài Immich từ App Store</a></strong>
              <p>Dùng địa chỉ riêng của gia đình; có thể kết nối an toàn cả khi không ở nhà.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div><strong>Chờ ổ lưu trữ riêng</strong><p>Chưa tải ảnh thật lên cho đến khi hệ thống báo đã sẵn sàng.</p></div>
          </li>
        </ol>
        <small>Khi được bật, hãy thử trước với 10 ảnh thường và không xóa ảnh gốc trên iPhone.</small>
      </section>

      <section className="no-touch" aria-labelledby="no-touch-title">
        <div>
          <p className="panel-kicker">CỨ ĐỂ HỆ THỐNG LO</p>
          <h2 id="no-touch-title">Bạn không phải mở sáu công cụ riêng</h2>
          <p>
            Các tên như BabyBuddy, Memos, Grocy, Node-RED, Uptime Kuma hay
            Ollama chỉ dành cho lúc bảo trì. Trên điện thoại, chúng được gọi bằng
            những việc quen thuộc dưới đây.
          </p>
        </div>
        <dl className="plain-role-grid">
          {plainRoles.map(([term, description]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <aside className="help-rule">
        <strong>Nếu có trục trặc</strong>
        <p>
          Nếu trang Em Bé không mở hoặc một thao tác không lưu được, chỉ cần báo
          tôi. Bạn không phải tự vào máy chủ hay sửa công cụ nào.
        </p>
      </aside>

      <footer>
        <p>Người thân chỉ xem nội dung đã được bố mẹ chọn.</p>
      </footer>
    </main>
  );
}
