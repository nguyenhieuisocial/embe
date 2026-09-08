import Link from "next/link";

import AppHeader from "../../../components/app-header";
import MealPhotoTracker from "../../../components/meal-photo-tracker";

export default function PregnancyMealPage() {
  return (
    <main className="pregnancy-main pregnancy-tool-page meal-page">
      <AppHeader note="Nhật ký ăn uống riêng tư" />
      <header className="pregnancy-tool-intro">
        <Link href="/me-bau">← Mẹ bầu</Link>
        <h1>Bữa ăn của Mẹ</h1>
        <p className="intro">Ghi lại bữa ngon, chăm Mẹ mỗi ngày.</p>
      </header>
      <MealPhotoTracker />
    </main>
  );
}
