import AppHeader from "../../../components/app-header";
import FolkGuideBrowser from "../../../components/folk-guide-browser";

export default function PregnancyFolkGuidePage() {
  return <main className="pregnancy-main folk-guide-page">
    <AppHeader note="Cẩm nang đã đối chiếu nguồn" tone="calm" />
    <header className="pregnancy-hero compact-page-hero">
      <div><p className="eyebrow">Giữ nét nhà mình, vẫn an toàn</p><h1>Mẹo & dân gian</h1><p className="intro">Tra nhanh một lời truyền miệng trước khi Mẹ làm theo.</p></div>
    </header>
    <aside className="folk-guide-key"><strong>Nhớ một nguyên tắc</strong><p>Mẹo chỉ giúp dễ chịu hơn. Không thay thuốc đã kê, lịch khám hoặc lời dặn riêng của nơi đang theo dõi thai.</p></aside>
    <FolkGuideBrowser />
    <aside className="folk-safety"><strong>Khi có dấu hiệu lạ</strong><p>Không chờ thử mẹo. Liên hệ nơi đang khám và ghi lại Mẹ đã dùng gì, lượng bao nhiêu, lúc nào.</p><a href="/me-bau#can-lien-he">Xem dấu hiệu cần liên hệ ngay</a></aside>
  </main>;
}
