"use client";
import Link from "next/link";
import PregnancyChapter from "./pregnancy-chapter";
import { useFamilyStage } from "../lib/use-family-stage";

export default function StageToday() {
  const { postpartum, stage } = useFamilyStage();
  if (!postpartum) return <PregnancyChapter />;
  const early = stage === "postpartum-0-6w";
  return <section className="section stage-today"><div className="section-head"><p className="panel-kicker">{early ? "Những tuần đầu sau sinh" : "Mẹ và Bé hôm nay"}</p><h2>{early ? "Nhẹ nhàng chăm cả hai" : "Theo đúng nhịp của gia đình"}</h2></div><div className="stage-today-actions"><Link href="/me" prefetch={false}><strong>Mẹ hồi phục</strong><span>Ghi điều quan trọng hôm nay</span></Link><Link href="/be" prefetch={false}><strong>Chăm Bé</strong><span>Bú, ngủ, tã và nhiệt độ</span></Link><Link href="/be/ho-so" prefetch={false}><strong>Lịch gần nhất</strong><span>Khám, tiêm và tài liệu</span></Link></div></section>;
}
