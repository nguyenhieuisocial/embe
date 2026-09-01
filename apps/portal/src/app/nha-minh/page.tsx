import AppHeader from "../../components/app-header";
import { Icon, type IconName } from "../../components/embe-icon";

const familyTools: Array<{
  href: string;
  icon: IconName;
  title: string;
  detail: string;
  label: string;
}> = [
  {
    href: "/do-dung",
    icon: "supply",
    title: "Đồ dùng",
    detail: "Theo dõi những thứ sắp hết và chuẩn bị cho mẹ, em bé.",
    label: "Mở đồ dùng"
  },
  {
    href: "/tro-ly",
    icon: "assistant",
    title: "Trợ lý riêng",
    detail: "Tóm tắt những gì gia đình đã ghi, không gửi dữ liệu thô ra ngoài.",
    label: "Mở trợ lý"
  },
  {
    href: "/lich",
    icon: "calendar",
    title: "Lịch gia đình",
    detail: "Xem lịch âm, lịch dương, việc cần làm và kỷ niệm cùng ngày.",
    label: "Mở lịch gia đình"
  },
  {
    href: "/huong-dan",
    icon: "guide",
    title: "Hướng dẫn",
    detail: "Cài EmBe lên iPhone và xem cách dùng thật ngắn gọn.",
    label: "Xem hướng dẫn"
  }
];

export default function FamilyHomePage() {
  const photoServerUrl = process.env.EMBE_PHOTO_SERVER_URL;

  return (
    <main className="page family-home-main">
      <AppHeader note="Không gian riêng của Ngân & Hiếu" />

      <section className="family-home-hero">
        <p className="eyebrow">MỘT NƠI CHO NHỮNG VIỆC ÍT DÙNG HƠN</p>
        <h1>Nhà mình</h1>
        <p className="intro">
          Đồ dùng, lịch, trợ lý và các thiết lập được gom ở đây để màn hình hằng
          ngày luôn nhẹ và dễ dùng bằng một tay.
        </p>
      </section>

      <nav className="section shortcut-list" aria-label="Công cụ của nhà mình">
        {familyTools.map((tool) => (
          <a className="shortcut" href={tool.href} key={tool.href} aria-label={tool.label}>
            <span className="shortcut-mark" aria-hidden="true"><Icon name={tool.icon} /></span>
            <span className="shortcut-text">
              <strong>{tool.title}</strong>
              <small>{tool.detail}</small>
            </span>
            <Icon name="arrow" className="icon icon-chevron" />
          </a>
        ))}
      </nav>

      <section className="section family-connection" aria-labelledby="photo-connection-title">
        <div className="section-head">
          <p className="panel-kicker">ẢNH GỐC Ở MÁY NHÀ</p>
          <h2 id="photo-connection-title">Thư viện ảnh riêng</h2>
        </div>
        <p>
          Immich giữ ảnh gốc; EmBe chỉ hiển thị những ảnh gia đình đã chọn qua
          đường kết nối riêng.
        </p>
        {photoServerUrl ? (
          <p className="state-note"><span className="dot" aria-hidden="true" /> Địa chỉ kết nối đã sẵn sàng trong Hướng dẫn.</p>
        ) : (
          <p className="state-note is-wait">Địa chỉ kết nối chỉ hiện khi máy nhà sẵn sàng.</p>
        )}
        <a className="btn btn-quiet btn-block" href="/huong-dan#iphone-title">Xem cách kết nối iPhone</a>
      </section>

      <section className="section family-privacy" aria-labelledby="family-privacy-title">
        <div className="section-head">
          <p className="panel-kicker">RIÊNG TƯ THEO MẶC ĐỊNH</p>
          <h2 id="family-privacy-title">Chỉ Hiếu và Ngân sử dụng</h2>
        </div>
        <p>Không có đăng ký công khai. Ảnh, sức khỏe và nhật ký không được đưa vào trang công khai hoặc cache dùng chung.</p>
      </section>
    </main>
  );
}
