"use client";

import Link from "next/link";

import AppHeader from "../../../components/app-header";
import PregnancyCareTracker from "../../../components/pregnancy-care-tracker";
import { calculatePregnancyWeek } from "../../../lib/pregnancy";
import { usePregnancyDueDate } from "../../../lib/use-pregnancy-due-date";

export default function IPhoneHealthPage() {
  const dueDate = usePregnancyDueDate();
  const week = calculatePregnancyWeek(dueDate);

  return (
    <main className="pregnancy-main pregnancy-tool-page">
      <AppHeader note="Đồng bộ riêng giữa iPhone và EmBe" />
      <header className="pregnancy-tool-intro">
        <Link href="/me-bau">← Mẹ bầu</Link>
        <p className="eyebrow">Apple Health · lịch dùng hằng ngày</p>
        <h1>Sức khỏe &amp; thuốc, vi chất</h1>
        <p className="intro">Xem dữ liệu từ iPhone; theo dõi riêng món theo đơn và món tự mua.</p>
      </header>
      <PregnancyCareTracker pregnancyWeek={week} />
    </main>
  );
}
