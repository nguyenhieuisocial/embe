import Link from "next/link";
import AppHeader from "../../components/app-header";
import AppRefreshControl from "../../components/app-refresh-control";
import FamilyToolDirectory from "../../components/family-tool-directory";
import { Icon } from "../../components/embe-icon";
import SystemStatus from "../../components/system-status";

export default function FamilyHomePage() {
  const photoServerUrl = process.env.EMBE_PHOTO_SERVER_URL;
  return <main className="page family-home-main">
    <AppHeader note="Không gian riêng của gia đình" />
    <section className="family-home-hero">
      <h1>Nhà mình</h1>
      <p className="intro">Mọi việc có một chỗ để tìm.</p>
    </section>
    <nav className="family-essentials" aria-label="Việc chung thường dùng">
      <Link href="/lich" prefetch={false}><Icon name="calendar" /><span>Lịch chung</span></Link>
      <Link href="/ke-hoach" prefetch={false}><Icon name="check" /><span>Kế hoạch</span></Link>
      <Link href="/nha-minh/ho-so" prefetch={false}><Icon name="care" /><span>Hồ sơ cả nhà</span></Link>
      <Link href="/cai-dat" prefetch={false}><Icon name="settings" /><span>Cài đặt</span></Link>
    </nav>
    <FamilyToolDirectory />
    <details className="hub-disclosure" id="trang-thai">
      <summary><span>Trạng thái &amp; cập nhật<small>Kết nối, đồng bộ và bản mới</small></span><Icon name="arrow" /></summary>
      <SystemStatus />
      <AppRefreshControl />
      <section className="family-connection" aria-labelledby="photo-connection-title">
        <h2 id="photo-connection-title">Thư viện ảnh riêng</h2>
        <p>{photoServerUrl ? "Địa chỉ Immich đã có trong Hướng dẫn." : "Địa chỉ Immich hiện khi máy nhà sẵn sàng."}</p>
        <Link className="btn btn-quiet" href="/huong-dan#iphone-title" prefetch={false}>Kết nối iPhone</Link>
      </section>
    </details>
    <p className="family-privacy-note">Dành riêng cho Hiếu &amp; Ngân. Không đăng ký công khai.</p>
  </main>;
}
