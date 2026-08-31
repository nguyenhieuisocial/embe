import AppHeader from "../../components/app-header";
import CopyServerAddress from "../../components/copy-server-address";

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
    href: "/ghi-lai",
    action: "Ghi một điều đáng nhớ"
  },
  {
    moment: "Cuối ngày",
    title: "Yên tâm nghỉ ngơi",
    detail: "Bạn không cần mở trang giám sát hoặc tự kiểm tra hệ thống. Nếu trang EmBe không mở, chỉ cần báo tôi.",
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
  const photoServerUrl = process.env.EMBE_PHOTO_SERVER_URL;
  const photoAccount = process.env.EMBE_PHOTO_ACCOUNT;

  return (
    <main className="guide-main">
      <AppHeader note="Một nơi để dùng mọi thứ" />

      <section className="guide-hero">
        <div>
          <p className="eyebrow">BẮT ĐẦU Ở ĐÂY</p>
          <h1>Bạn không cần học các ứng dụng phía sau</h1>
          <p className="intro">
            Từ giờ, hãy coi <strong>EmBe</strong> là cánh cửa duy nhất. Những phần
            kỹ thuật tự lưu, tự chuyển và tự kiểm tra ở phía sau.
          </p>
        </div>
        <div className="one-door" aria-label="Một cánh cửa cho cả gia đình">
          <span>1</span>
          <p>trang duy nhất<br />bạn cần nhớ</p>
          <strong>embe.hieu.asia</strong>
        </div>
      </section>

      <section className="install-app" aria-labelledby="install-app-title">
        <div className="install-app-heading">
          <p className="panel-kicker">DÙNG NHƯ MỘT ỨNG DỤNG</p>
          <h2 id="install-app-title">Đặt EmBe lên màn hình chính</h2>
          <p>Không cần tải từ App Store. Sau khi cài, EmBe mở toàn màn hình và nằm cạnh các ứng dụng quen thuộc.</p>
        </div>
        <div className="home-screen-mark" aria-hidden="true">
          <span>EB</span>
          <small>EmBe</small>
        </div>
        <ol className="install-steps">
          <li><span>1</span><p><strong>Mở EmBe bằng Safari</strong> tại embe.hieu.asia.</p></li>
          <li><span>2</span><p>Chạm nút <strong>Chia sẻ</strong> ở thanh công cụ.</p></li>
          <li><span>3</span><p>Chọn <strong>Thêm vào Màn hình chính</strong>, rồi chạm Thêm.</p></li>
        </ol>
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

      <section className="current-stage-guide" aria-labelledby="current-stage-title">
        <p className="panel-kicker">GIAI ĐOẠN HIỆN TẠI · ĐANG MANG THAI</p>
        <h2 id="current-stage-title">Lúc này chỉ cần ba việc</h2>
        <ol>
          <li><strong>Chăm Mẹ Ngân</strong><span>Tích việc hôm nay và ghi sức khỏe khi cần.</span></li>
          <li><strong>Giữ lịch</strong><span>Lưu ngày khám và mở lại kỷ niệm theo đúng ngày.</span></li>
          <li><strong>Lưu điều đáng nhớ</strong><span>Một câu hoặc một tấm ảnh là đủ.</span></li>
        </ol>
      </section>

      <section className="iphone-setup" aria-labelledby="iphone-title">
        <div className="iphone-heading">
          <p className="panel-kicker">ẢNH TỰ VỀ MÁY NHÀ</p>
          <h2 id="iphone-title">Đưa ảnh từ iPhone vào EmBe</h2>
          <p>Chỉ cần thiết lập một lần. Ảnh gốc không đi qua Vercel hay trang web công khai.</p>
        </div>
        <ol className="iphone-steps">
          <li>
            <span>1</span>
            <div>
              <strong><a className="app-store-link" href="https://apps.apple.com/us/app/tailscale/id1470499037">Cài Tailscale từ App Store</a></strong>
              <p>Đăng nhập cùng tài khoản gia đình và bật kết nối riêng.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong><a className="app-store-link" href="https://apps.apple.com/us/app/immich/id1613945652">Cài Immich từ App Store</a></strong>
              <p>Bật Tailscale, rồi dùng địa chỉ riêng hiện trong EmBe ở ô Server Endpoint URL.</p>
              {photoServerUrl ? (
                <CopyServerAddress address={photoServerUrl} />
              ) : (
                <p className="setup-pending" role="status">Địa chỉ sẽ hiện khi thư viện ảnh gia đình sẵn sàng.</p>
              )}
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Đăng nhập tài khoản gia đình</strong>
              <p>
                {photoAccount ? <>Đăng nhập bằng tài khoản <strong>{photoAccount}</strong> đã được chuẩn bị riêng, rồi bật Sao lưu trong Immich. </> : <>Dùng tài khoản ảnh gia đình đã được chuẩn bị riêng, rồi bật Sao lưu trong Immich. </>}
                Đây không phải tài khoản quản trị và ảnh gốc sẽ về máy nhà qua kết nối riêng.
              </p>
            </div>
          </li>
        </ol>
        <small>Khi được bật, hãy thử trước với 10 ảnh thường và không xóa ảnh gốc trên iPhone.</small>
      </section>

      <section className="no-touch" aria-labelledby="no-touch-title">
        <div>
          <p className="panel-kicker">SAU KHI EM BÉ CHÀO ĐỜI</p>
          <h2 id="no-touch-title">Bạn không phải mở sáu công cụ riêng</h2>
          <p className="stage-later-label">Sau khi em bé chào đời</p>
          <p>
            Các phần kỹ thuật chỉ dành cho lúc bảo trì. Trên điện thoại, mọi thứ
            được gọi bằng những việc quen thuộc dưới đây.
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
          Nếu trang EmBe không mở hoặc một thao tác không lưu được, chỉ cần báo
          tôi. Bạn không phải tự vào máy chủ hay sửa công cụ nào.
        </p>
        <form className="logout-form" action="/api/auth/logout" method="post">
          <button type="submit">Đăng xuất khỏi EmBe</button>
        </form>
      </aside>

      <footer>
        <p>Người thân chỉ xem nội dung đã được bố mẹ chọn.</p>
      </footer>
    </main>
  );
}
