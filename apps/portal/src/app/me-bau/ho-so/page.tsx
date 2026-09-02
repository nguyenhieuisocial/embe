import AppHeader from "../../../components/app-header";
import PregnancyProfileEditor from "../../../components/pregnancy-profile-editor";

export default function PregnancyProfilePage() {
  return (
    <main className="pregnancy-main pregnancy-profile-page">
      <AppHeader note="Hồ sơ riêng của Mẹ Ngân" />
      <header className="pregnancy-profile-intro">
        <a href="/me-bau">← Mẹ bầu</a>
        <p className="eyebrow">Một nơi để dùng chung</p>
        <h1>Hồ sơ thai kỳ</h1>
        <p className="intro">Ngày dự sinh, điều cần lưu ý và người có thể gọi khi cần.</p>
      </header>
      <PregnancyProfileEditor />
    </main>
  );
}
