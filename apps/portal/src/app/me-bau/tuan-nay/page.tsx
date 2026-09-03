"use client";

import Link from "next/link";

import AppHeader from "../../../components/app-header";
import { fetalSizeForWeek, fetalSizeSourceUrl } from "../../../lib/fetal-size";
import { calculatePregnancyWeek } from "../../../lib/pregnancy";
import { upcomingPregnancyCareWindows } from "../../../lib/pregnancy-care-windows";
import { prenatalGuideSources, prenatalStageGuide } from "../../../lib/prenatal-stage-guide";
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
  const careWindows = week === null ? [] : upcomingPregnancyCareWindows(dueDate, week);
  const fetalSize = week === null ? null : fetalSizeForWeek(week);
  const prenatalGuide = week === null ? null : prenatalStageGuide(week);

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
          <Link className="btn btn-primary" href="/me-bau/ho-so">Cài ngày dự sinh</Link>
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
            {fetalSize ? <div className="fetal-size" aria-label={`Bé ở tuần ${fetalSize.week}`}>
              <span className="fetal-size-visual" aria-hidden="true">{fetalSize.emoji}</span>
              <span>
                <small>Bé đang lớn từng ngày</small>
                <strong>Cỡ {fetalSize.comparison}</strong>
                <p>{fetalSize.lengthCm === null ? "Bé vẫn còn rất nhỏ." : `Dài khoảng ${fetalSize.lengthCm.toLocaleString("vi-VN")} cm.`} So sánh chỉ để dễ hình dung.</p>
                <a href={fetalSizeSourceUrl(fetalSize.week)} target="_blank" rel="noreferrer">Nguồn NHS tuần {fetalSize.week} ↗</a>
              </span>
            </div> : null}
          </section>

          <section className="section" aria-labelledby="week-actions-title">
            <p className="panel-kicker">Ba việc trong tầm tay</p>
            <h2 id="week-actions-title">Mở đúng chỗ khi cần</h2>
            <ul className="today-priority-list">
              <li><Link href="/me-bau#suc-khoe"><span><strong>Ghi sức khỏe</strong><small>Số đo, giấc ngủ và cảm nhận hôm nay</small></span><b>Ghi</b></Link></li>
              <li><Link href="/me-bau/trieu-chung"><span><strong>Ghi triệu chứng</strong><small>Lưu diễn biến để trao đổi khi khám</small></span><b>Mở</b></Link></li>
              <li><Link href="/me-bau?quick=appointment#ho-so-kham"><span><strong>Chuẩn bị lần khám</strong><small>Lịch, câu hỏi và hồ sơ liên quan</small></span><b>Xem</b></Link></li>
              {week >= 16 ? <li><Link href="/me-bau/thai-may"><span><strong>Ghi nhịp thai máy</strong><small>Theo dõi nhịp hoạt động quen thuộc của Bé</small></span><b>Ghi</b></Link></li> : null}
            </ul>
          </section>

          {prenatalGuide ? <section className="section prenatal-week-guide" aria-labelledby="prenatal-guide-title">
            <p className="panel-kicker">Nhẹ nhàng trong tuần</p>
            <h2 id="prenatal-guide-title">Chăm Mẹ, gần Bé</h2>
            <div className="prenatal-guide-grid">
              <article><span aria-hidden="true">⌁</span><div><strong>Vận động</strong><p>{prenatalGuide.movement}</p></div></article>
              <article><span aria-hidden="true">♡</span><div><strong>Dễ chịu hơn</strong><p>{prenatalGuide.comfort}</p></div></article>
              <article><span aria-hidden="true">♪</span><div><strong>Gắn kết</strong><p>{prenatalGuide.bonding}</p></div></article>
              <article><span aria-hidden="true">∞</span><div><strong>Cùng Ba Hiếu</strong><p>{prenatalGuide.partner}</p></div></article>
            </div>
            <div className="prenatal-guide-actions">
              <Link href="/me-bau/thu-gian">Thở nhẹ 2–8 phút</Link>
              <Link href="/ghi-lai">Lưu khoảnh khắc</Link>
              <Link href="/ke-hoach">Việc hai người</Link>
            </div>
            <details className="prenatal-guide-sources"><summary>Nguồn và giới hạn an toàn <span>⌄</span></summary><div>
              {prenatalGuideSources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label} ↗</a>)}
              <p>Hãy hỏi nơi khám trước khi bắt đầu hoặc đổi bài tập. Nội dung này không thay chỉ dẫn riêng.</p>
            </div></details>
          </section> : null}

          {careWindows.length ? <section className="section" aria-labelledby="care-window-title">
            <p className="panel-kicker">Mốc sắp tới</p><h2 id="care-window-title">Chủ động hỏi nơi khám</h2>
            <div className="care-window-list">{careWindows.map((item) => <article key={item.weekLabel}>
              <span>{item.weekLabel}<small>{item.dateLabel}</small></span>
              <div><strong>{item.title}</strong><p>{item.note}</p></div>
            </article>)}</div>
            <div className="care-window-actions"><Link href="/me-bau?quick=appointment#ho-so-kham">Thêm lịch đã xác nhận</Link><a href="https://vnpa.moh.gov.vn/wp-content/uploads/2026/05/QD-1139-Tai-lieu-huong-dan-cham-soc-SKSS.pdf" target="_blank" rel="noreferrer">Nguồn Bộ Y tế ↗</a></div>
            <small className="care-window-disclaimer">Đây là khoảng gợi ý để chuẩn bị, không phải lịch hẹn. Lịch của bác sĩ/nơi khám luôn được ưu tiên.</small>
          </section> : null}

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
