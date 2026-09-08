import type { Metadata } from 'next';
import Link from 'next/link';
import AppHeader from '../../components/app-header';
import StudioCollection from '../../components/studio-collection';
import StudioNav from '../../components/studio-nav';
import StudioAutomation from '../../components/studio-automation';
import { SouthernVoiceSample } from '../../components/studio-voice-picker';
import { studioInfo, studioTopics } from '../../lib/studio';
import './studio.css';
import './studio-home.css';

export const metadata: Metadata = { title: 'Studio — EmBe Mẹ Bầu' };
export default function StudioPage() {
  const topics = studioTopics().map(({ slug, title, pillar, stage, duration, audio }) => ({ slug, title, pillar, stage, duration, audio }));
  return <main className="page studio-main studio-home">
    <AppHeader note="Xưởng nội dung riêng" />
    <StudioNav />
    <header className="studio-home-heading">
      <div><h1>Studio của EmBe</h1><p>Từ điều muốn chia sẻ đến một video gần gũi.</p></div>
      <Link className="studio-create" href="/studio/soan">Tạo video mới <span aria-hidden="true">＋</span></Link>
    </header>
    <div className="studio-home-layout">
      <aside className="studio-home-tools" aria-label="Công cụ sáng tạo">
        <Link className="studio-resume" href="/studio/ban-lam-viec"><strong>Tiếp tục bản đang làm</strong><span>Kịch bản, giọng đọc và bản dựng</span></Link>
        <details className="studio-disclosure"><summary>Tiến độ & tự động hóa</summary><StudioAutomation /></details>
        <details className="studio-disclosure"><summary>Nghe giọng nữ miền Nam mới</summary><SouthernVoiceSample/><Link className="studio-back" href="/studio/soan">Chọn giọng khi soạn video</Link></details>
        <details className="studio-disclosure"><summary>Tìm nguồn & ý tưởng</summary>
          <Link className="studio-back" href="/studio/kham-pha">Khám phá chủ đề & lưu ý tưởng</Link>
          <Link className="studio-back" href="/studio/nghien-cuu">Nghiên cứu & hướng nội dung</Link>
        </details>
        <p className="studio-home-privacy">Bản dựng trong EmBe chưa đồng nghĩa với đã đăng lên mạng xã hội.</p>
      </aside>
      <div className="studio-home-library"><h2>Thư viện nội dung</h2><StudioCollection topics={topics} ideas={studioInfo.ideas} /></div>
    </div>
  </main>;
}
