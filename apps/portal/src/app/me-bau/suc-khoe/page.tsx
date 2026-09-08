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
        <h1>Ghi sức khỏe</h1>
        <p className="intro">Một chút mỗi ngày, để chăm sóc Mẹ hơn.</p>
      </header>
      <PregnancyHealthTracker pregnancyWeek={week} />
      <Link className="health-measurement-link" href="/nha-minh/ho-so?role=mother&tab=records"><strong>Ghi nhiều lần đo trong ngày →</strong><span>Lưu riêng từng giờ, trước hoặc sau ăn trong sổ số đo.</span></Link>
    </main>
  );
}
