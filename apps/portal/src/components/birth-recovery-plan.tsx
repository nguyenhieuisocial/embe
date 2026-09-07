"use client";

import Link from "next/link";
import { useState } from "react";
import { BIRTH_RECOVERY_STEPS } from "../lib/birth-recovery-plan";
import { useFamilyStage } from "../lib/use-family-stage";
import "./daily-care-tools.css";

export default function BirthRecoveryPlan({ day }: { day: string }) {
  const { postpartum } = useFamilyStage();
  const [manualPhase, setManualPhase] = useState<"prepare" | "recovery" | null>(null);
  const phase = manualPhase ?? (postpartum ? "recovery" : "prepare");
  return <details className="care-inline"><summary>Kế hoạch sinh & phục hồi</summary>
    <div className="care-inline-actions"><button type="button" aria-pressed={phase === "prepare"} onClick={() => setManualPhase("prepare")}>Chuẩn bị sinh</button>
      <button type="button" aria-pressed={phase === "recovery"} onClick={() => setManualPhase("recovery")}>Sau sinh</button></div>
    <p>Chọn một bước, sửa ngày và người làm rồi lưu vào kế hoạch chung. Không tự tạo việc hay lịch khám khi chưa xác nhận.</p>
    <ol>{BIRTH_RECOVERY_STEPS.filter(step => step.phase === phase).map(step => <li key={step.id}>
      <p><strong>{step.title}</strong><br />{step.note}</p>
      <div className="care-inline-actions"><Link href={`/ke-hoach?date=${day}&them=1&template=${step.id}#them-viec`}>Đưa vào kế hoạch</Link></div>
    </li>)}</ol>
  </details>;
}
