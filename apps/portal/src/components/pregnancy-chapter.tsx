"use client";

import { useEffect, useState } from "react";

import { calculatePregnancyWeek } from "../lib/pregnancy";

const DUE_DATE_KEY = "embe:pregnancy:due-date";
const STAGE_CHANGE_EVENT = "embe:pregnancy-stage-change";

function chapterFor(dueDate: string) {
  const week = calculatePregnancyWeek(dueDate);
  if (week === null) return {
    kicker: "Mới mang thai",
    title: "Mình bắt đầu thật nhẹ nhàng",
    detail: "Ưu tiên sức khỏe Mẹ Ngân, ghi câu hỏi cho lần khám tới và cài ngày dự sinh khi đã có.",
    action: "Chăm Mẹ hôm nay"
  };
  if (week <= 13) return {
    kicker: `Tuần ${week} · ba tháng đầu`,
    title: "Chăm mẹ trước, mọi việc khác để sau",
    detail: "EmBe ưu tiên nghỉ ngơi, ăn uống an toàn, lịch khám và những điều Mẹ Ngân muốn hỏi.",
    action: "Xem ưu tiên hôm nay"
  };
  if (week <= 27) return {
    kicker: `Tuần ${week} · ba tháng giữa`,
    title: "Cùng theo dõi từng thay đổi nhỏ",
    detail: "Sức khỏe, bữa ăn, vận động nhẹ và những khoảnh khắc đáng nhớ được đưa lên trước.",
    action: "Xem hành trình hôm nay"
  };
  return {
    kicker: `Tuần ${week} · ba tháng cuối`,
    title: "Chuẩn bị đón em bé, từng chút một",
    detail: "EmBe ưu tiên lịch khám, dấu hiệu cần liên hệ và những việc thật sự cần trước ngày sinh.",
    action: "Xem việc cần chuẩn bị"
  };
}

export default function PregnancyChapter() {
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    const refresh = () => setDueDate(localStorage.getItem(DUE_DATE_KEY) ?? "");
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(STAGE_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(STAGE_CHANGE_EVENT, refresh);
    };
  }, []);

  const chapter = chapterFor(dueDate);

  return (
    <section className="section pregnancy-chapter" aria-labelledby="pregnancy-chapter-title">
      <div className="chapter-thread" aria-hidden="true"><span /></div>
      <div>
        <p className="panel-kicker">{chapter.kicker}</p>
        <h2 id="pregnancy-chapter-title">{chapter.title}</h2>
        <p>{chapter.detail}</p>
      </div>
      <div className="chapter-actions">
        <a href="/me-bau">{chapter.action}</a>
        <a href="/lich" aria-label="Mở lịch gia đình">Mở lịch</a>
      </div>
    </section>
  );
}
