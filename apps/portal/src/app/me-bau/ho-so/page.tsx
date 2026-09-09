import AppHeader from "../../../components/app-header";
import PregnancyMedicalRecords from "../../../components/pregnancy-medical-records";
import PregnancyProfileEditor from "../../../components/pregnancy-profile-editor";
import Link from "next/link";

export default function PregnancyProfilePage() {
  return (
    <main className="pregnancy-main pregnancy-profile-page">
      <AppHeader note="Hồ sơ riêng tư" />
      <header className="pregnancy-profile-intro">
        <h1>Hồ sơ thai kỳ</h1>
      </header>
      <PregnancyMedicalRecords />
      <details className="pregnancy-profile-settings"><summary>Thông tin của Mẹ & thai kỳ</summary>
        <Link className="btn btn-quiet btn-block" href="/nha-minh/ho-so?role=mother">Tiền sử & hồ sơ sức khỏe Mẹ</Link>
        <PregnancyProfileEditor />
      </details>
    </main>
  );
}
