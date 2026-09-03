import Link from "next/link";

import AppHeader from "../../components/app-header";
import AppRefreshControl from "../../components/app-refresh-control";
import { Icon, type IconName } from "../../components/embe-icon";
import SystemStatus from "../../components/system-status";

const familyTools: Array<{
  href: string;
  icon: IconName;
  title: string;
  detail: string;
  label: string;
}> = [
  {
    href: "/cai-dat",
    icon: "settings",
    title: "Cài đặt",
    detail: "Điện thoại, thông báo và hồ sơ gia đình.",
    label: "Mở cài đặt"
  },
  {
    href: "/so-me-va-be",
    icon: "guide",
    title: "Sổ Mẹ & Bé",
    detail: "Xem trước, lưu PDF hoặc in.",
    label: "Mở Sổ Mẹ và Bé"
  },
  {
    href: "/tim-kiem",
    icon: "memory",
    title: "Tìm trong EmBe",
    detail: "Ảnh, chuyến đi và nhật ký.",
    label: "Mở tìm kiếm"
  },
  {
    href: "/do-dung",
    icon: "supply",
    title: "Đồ dùng",
    detail: "Số lượng và món sắp hết.",
    label: "Mở đồ dùng"
  },
  {
    href: "/tro-ly",
    icon: "assistant",
    title: "Trợ lý riêng",
    detail: "Tóm tắt dữ liệu gia đình đã ghi.",
    label: "Mở trợ lý"
  },
  {
    href: "/lich",
    icon: "calendar",
    title: "Lịch gia đình",
    detail: "Lịch âm, lịch dương và việc cùng ngày.",
    label: "Mở lịch gia đình"
  },
  {
    href: "/huong-dan",
    icon: "guide",
    title: "Hướng dẫn",
    detail: "Cài trên iPhone và xem cách dùng.",
    label: "Xem hướng dẫn"
  }
];

export default function FamilyHomePage() {
  const photoServerUrl = process.env.EMBE_PHOTO_SERVER_URL;

  return (
    <main className="page family-home-main">
      <AppHeader note="Công cụ & thiết lập" />

      <section className="family-home-hero">
        <p className="eyebrow">Công cụ của gia đình</p>
        <h1>Nhà mình</h1>
        <p className="intro">Chọn công cụ cần mở hoặc thiết lập điện thoại này.</p>
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

      <SystemStatus />
      <AppRefreshControl />

      <section className="section family-connection" aria-labelledby="photo-connection-title">
        <div className="section-head">
          <p className="panel-kicker">Ảnh gốc ở máy nhà</p>
          <h2 id="photo-connection-title">Thư viện ảnh riêng</h2>
        </div>
        <p>Ảnh gốc nằm trong Immich; EmBe chỉ hiện ảnh gia đình đã chọn.</p>
        {photoServerUrl ? (
          <p className="state-note"><span className="dot" aria-hidden="true" /> Địa chỉ kết nối đã sẵn sàng trong Hướng dẫn.</p>
        ) : (
          <p className="state-note is-wait">Địa chỉ kết nối chỉ hiện khi máy nhà sẵn sàng.</p>
        )}
        <Link className="btn btn-quiet btn-block" href="/huong-dan#iphone-title">Xem cách kết nối iPhone</Link>
      </section>

      <section className="section family-privacy" aria-labelledby="family-privacy-title">
        <div className="section-head">
          <p className="panel-kicker">Riêng tư theo mặc định</p>
          <h2 id="family-privacy-title">Chỉ Hiếu và Ngân sử dụng</h2>
        </div>
        <p>Không có đăng ký công khai; dữ liệu không xuất hiện trên trang công khai.</p>
      </section>
    </main>
  );
}
