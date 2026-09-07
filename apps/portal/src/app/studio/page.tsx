import type { Metadata } from 'next';
import Link from 'next/link';
import AppHeader from '../../components/app-header';
import StudioCollection from '../../components/studio-collection';
import StudioNav from '../../components/studio-nav';
import { studioInfo, studioTopics } from '../../lib/studio';
import './studio.css';

export const metadata: Metadata = { title: 'Studio — EmBe Mẹ Bầu' };
export default function StudioPage() {
  const topics = studioTopics().map(({ slug, title, pillar, stage, duration, audio }) => ({ slug, title, pillar, stage, duration, audio }));
  return <main className="page studio-main">
    <AppHeader note="Xưởng nội dung riêng" />
    <StudioNav />
    <header className="studio-heading"><h1>Studio</h1><p>Kiến thức gần gũi cùng EmBe Mẹ Bầu.</p></header>
    <aside className="studio-notice"><strong>Bản nháp, chưa duyệt chuyên môn</strong><p>Xem và chuẩn bị nội dung tại đây. Chưa tự đăng mạng xã hội.</p></aside>
    <div className="studio-action-grid"><Link href="/studio/ban-lam-viec">Mở bàn làm việc</Link><Link href="/studio/soan">Viết & dựng video mới</Link></div>
    <StudioCollection topics={topics} ideas={studioInfo.ideas} />
    <Link className="studio-back" href="/studio/kham-pha">Khám phá chủ đề & lưu ý tưởng</Link>
    <Link className="studio-back" href="/studio/nghien-cuu">Nghiên cứu & hướng nội dung</Link>
  </main>;
}
