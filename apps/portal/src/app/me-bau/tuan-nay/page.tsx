"use client";

import AppHeader from "../../../components/app-header";
import { calculatePregnancyWeek } from "../../../lib/pregnancy";
import { usePregnancyDueDate } from "../../../lib/use-pregnancy-due-date";

function stageFor(week: number): { name: string; focus: string } {
  if (week <= 13) return {
    name: "Ba tháng đầu",
    focus: "Nghỉ khi mệt, ăn uống an toàn và lưu câu hỏi cho lần khám tiếp theo."
  };
  if (week <= 27) return {
    name: "Ba tháng giữa",
    focus: "Theo dõi thay đổi của cơ thể, giữ lịch khám và vận động ở mức nơi khám đã đồng ý."
  };
  return {
    name: "Ba tháng cuối",
    focus: "Giữ số liên hệ, lịch khám và những việc chuẩn bị sinh trong tầm tay."
  };
}

function officialWeekUrl(week: number): string {
  if (week < 4 || week > 41) return "https://www.nhs.uk/best-start-in-life/pregnancy/week-by-week-guide-to-pregnancy/";
  const trimester = week <= 12 ? "1st-trimester" : week <= 27 ? "2nd-trimester" : "3rd-trimester";
  return `https://www.nhs.uk/best-start-in-life/pregnancy/week-by-week-guide-to-pregnancy/${trimester}/week-${week}/`;
}

export default function PregnancyWeekPage() {
  const dueDate = usePregnancyDueDate();
  const week = calculatePregnancyWeek(dueDate);

  return (
    <main className="pregnancy-main">
      <AppHeader note="Hành trình của Mẹ Ngân" tone="calm" />
      <section className="pregnancy-hero compact-page-hero">
        <div>
          <p className="eyebrow">Đúng giai đoạn · ít nhưng hữu ích</p>
          <h1>Tuần này</h1>
          <p className="intro">Một nơi để biết nên mở việc gì, không biến thai kỳ thành danh sách áp lực.</p>
        </div>
      </section>

      {week === null ? (
        <section className="section" aria-labelledby="week-empty-title">
          <p className="panel-kicker">Cần một thông tin</p>
          <h2 id="week-empty-title">Thêm ngày dự sinh</h2>
          <p>EmBe sẽ tự tính tuần thai và chỉ hiện nội dung phù hợp với giai đoạn hiện tại.</p>
          <a className="btn btn-primary" href="/me-bau/ho-so">Cài ngày dự sinh</a>
        </section>
      ) : (
        <>
          <section className="section week-journey" aria-labelledby="current-week-title">
            <p className="panel-kicker">{stageFor(week).name}</p>
            <h2 id="current-week-title">Tuần {week}</h2>
            <p>{stageFor(week).focus}</p>
            <div className="care-progress" role="progressbar" aria-label="Tiến độ thai kỳ" aria-valuemin={0} aria-valuemax={40} aria-valuenow={Math.min(40, week)}>
              <i style={{ width: `${Math.min(100, Math.max(2, (week / 40) * 100))}%` }} />
            </div>
          </section>

          <section className="section" aria-labelledby="week-actions-title">
            <p className="panel-kicker">Ba việc trong tầm tay</p>
            <h2 id="week-actions-title">Mở đúng chỗ khi cần</h2>
            <ul className="today-priority-list">
              <li><a href="/me-bau#suc-khoe"><span><strong>Ghi sức khỏe</strong><small>Số đo, giấc ngủ và cảm nhận hôm nay</small></span><b>Ghi</b></a></li>
              <li><a href="/me-bau/trieu-chung"><span><strong>Ghi triệu chứng</strong><small>Lưu diễn biến để trao đổi khi khám</small></span><b>Mở</b></a></li>
              <li><a href="/me-bau?quick=appointment#ho-so-kham"><span><strong>Chuẩn bị lần khám</strong><small>Lịch, câu hỏi và hồ sơ liên quan</small></span><b>Xem</b></a></li>
            </ul>
          </section>

          <aside className="medical-boundary">
            <strong>Không tự chẩn đoán từ nội dung theo tuần.</strong>
            <p>Thông tin cá nhân từ bác sĩ và nơi đang khám luôn được ưu tiên.</p>
            <a href={officialWeekUrl(week)} rel="noreferrer" target="_blank">Đọc hướng dẫn tuần {week} từ NHS ↗</a>
          </aside>
        </>
      )}
    </main>
  );
}
