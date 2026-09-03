import Link from "next/link";

import AppHeader from "../../../components/app-header";
import MealPhotoTracker from "../../../components/meal-photo-tracker";

export default function PregnancyMealPage() {
  return (
    <main className="pregnancy-main pregnancy-tool-page">
      <AppHeader note="Nhật ký ăn uống riêng tư" />
      <header className="pregnancy-tool-intro">
        <Link href="/me-bau">← Mẹ bầu</Link>
        <p className="eyebrow">Chụp hoặc nhập món</p>
        <h1>Bữa ăn của Mẹ</h1>
        <p className="intro">Nhận diện trước, Mẹ sửa lại món và khẩu phần rồi mới lưu.</p>
      </header>
      <MealPhotoTracker />
    </main>
  );
}
