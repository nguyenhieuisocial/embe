"use client";

import Link from "next/link";

import AppHeader from "../../../components/app-header";
import PregnancyHealthTracker from "../../../components/pregnancy-health-tracker";
import { calculatePregnancyWeek } from "../../../lib/pregnancy";
import { usePregnancyDueDate } from "../../../lib/use-pregnancy-due-date";

export default function PregnancyHealthPage() {
  const dueDate = usePregnancyDueDate();
  const week = calculatePregnancyWeek(dueDate);

  return (
    <main className="pregnancy-main pregnancy-tool-page">
      <AppHeader note="Sức khỏe riêng của Mẹ Ngân" />
      <header className="pregnancy-tool-intro">
        <Link href="/me-bau">← Mẹ bầu</Link>
        <p className="eyebrow">Một lần ghi · xem được cả lịch sử</p>
        <h1>Sức khỏe của Mẹ</h1>
        <p className="intro">Cân nặng, huyết áp, giấc ngủ và những điều cần nhớ khi đi khám.</p>
      </header>
      <PregnancyHealthTracker pregnancyWeek={week} />
    </main>
  );
}
