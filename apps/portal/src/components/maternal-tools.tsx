import Link from "next/link";
import { Icon } from "./embe-icon";

export default function MaternalTools({ week }: { week: number | null }) {
  return <>
    <nav className="maternal-shortcuts" aria-label="Công cụ hằng ngày">
      <Link id="bua-an" href="/me-bau/bua-an"><Icon name="meal" /><span><strong>Bữa ăn</strong><small>Chụp món · dinh dưỡng</small></span></Link>
      <Link id="suc-khoe" href="/me-bau/suc-khoe"><Icon name="care" /><span><strong>Sức khỏe</strong><small>Số đo · ngủ · nước</small></span></Link>
      <Link href="/me-bau/thuoc"><Icon name="check" /><span><strong>Thuốc &amp; vi chất</strong><small>Lịch dùng hằng ngày</small></span></Link>
      <Link id="ho-so-kham" href="/me-bau/ho-so"><Icon name="album" /><span><strong>Hồ sơ &amp; lịch khám</strong><small>Giấy tờ · ngày hẹn</small></span></Link>
    </nav>
    <nav className="care-inline-links" aria-label="Chăm sóc và hỗ trợ">
      <Link href="/me-bau/tam-trang" prefetch={false}>Tâm trạng</Link>
      <Link href="/me-bau/trieu-chung" prefetch={false}>Triệu chứng</Link>
      {week !== null && week >= 28 && <Link href="/me-bau/thai-may" prefetch={false}>Thai máy</Link>}
      <a className="care-help-link" href="#can-lien-he">Khi cần trợ giúp</a>
    </nav>
  </>;
}
