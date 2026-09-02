"use client";

import { calculatePregnancyWeek } from "../lib/pregnancy";
import { usePregnancyDueDate } from "../lib/use-pregnancy-due-date";

function chapterFor(dueDate: string) {
  const week = calculatePregnancyWeek(dueDate);
  if (week === null) return {
    kicker: "Mới mang thai",
    title: "Mình bắt đầu thật nhẹ nhàng",
    detail: "Sức khỏe Mẹ, lịch khám và ngày dự sinh.",
    action: "Chăm Mẹ hôm nay"
  };
  if (week <= 13) return {
    kicker: `Tuần ${week} · ba tháng đầu`,
    title: "Chăm mẹ trước, mọi việc khác để sau",
    detail: "Nghỉ ngơi, ăn an toàn, lịch khám và câu hỏi cho bác sĩ.",
    action: "Xem ưu tiên hôm nay"
  };
  if (week <= 27) return {
    kicker: `Tuần ${week} · ba tháng giữa`,
    title: "Cùng theo dõi từng thay đổi nhỏ",
    detail: "Sức khỏe, bữa ăn, vận động nhẹ và kỷ niệm.",
    action: "Xem hành trình hôm nay"
  };
  return {
    kicker: `Tuần ${week} · ba tháng cuối`,
    title: "Chuẩn bị đón em bé, từng chút một",
    detail: "Lịch khám, dấu hiệu cần liên hệ và đồ cần chuẩn bị.",
    action: "Xem việc cần chuẩn bị"
  };
}

export default function PregnancyChapter() {
  const dueDate = usePregnancyDueDate();

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
