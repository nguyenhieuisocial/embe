import type { Metadata } from 'next';
import AppHeader from '../../components/app-header';
import StudioCollection from '../../components/studio-collection';
import { studioInfo, studioTopics } from '../../lib/studio';
import './studio.css';

export const metadata: Metadata = { title: 'Studio — EmBe Mẹ Bầu' };
export default function StudioPage() {
  const topics = studioTopics().map(({ slug, title, pillar, stage, duration, audio }) => ({ slug, title, pillar, stage, duration, audio }));
  return <main className="page studio-main">
    <AppHeader note="Xưởng nội dung riêng" />
    <header className="studio-heading"><h1>Studio</h1><p>Kiến thức gần gũi cùng EmBe Mẹ Bầu.</p></header>
    <aside className="studio-notice"><strong>Bản nháp, chưa duyệt chuyên môn</strong><p>Xem và chuẩn bị nội dung tại đây. Chưa tự đăng mạng xã hội.</p></aside>
    <StudioCollection topics={topics} ideas={studioInfo.ideas} />
  </main>;
}
