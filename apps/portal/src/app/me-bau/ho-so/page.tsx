import Link from "next/link";

import AppHeader from "../../../components/app-header";
import PregnancyMedicalRecords from "../../../components/pregnancy-medical-records";
import PregnancyProfileEditor from "../../../components/pregnancy-profile-editor";

export default function PregnancyProfilePage() {
  return (
    <main className="pregnancy-main pregnancy-profile-page">
      <AppHeader note="Hồ sơ riêng của Mẹ Ngân" />
      <header className="pregnancy-profile-intro">
        <Link href="/me-bau">← Mẹ bầu</Link>
        <h1>Hồ sơ thai kỳ</h1>
        <p className="intro">Chụp giấy tờ, xem kết quả và chuẩn bị lần khám tiếp theo.</p>
      </header>
      <PregnancyMedicalRecords />
      <details className="pregnancy-profile-settings"><summary>Thông tin thai kỳ & người liên hệ</summary><PregnancyProfileEditor /></details>
    </main>
  );
}
