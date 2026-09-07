import type { Metadata } from 'next';
import Link from 'next/link';
import AppHeader from '../../../components/app-header';
import StudioDiscovery from '../../../components/studio-discovery';
import '../studio.css';
export const metadata: Metadata = { title: 'Khám phá chủ đề — EmBe Studio' };
export default function DiscoveryPage() {
  return <main className="page studio-main"><AppHeader note="EmBe Mẹ Bầu" /><Link className="studio-back" href="/studio">‹ Về Studio</Link><header className="studio-heading"><h1>Khám phá chủ đề</h1><p>Tìm câu hỏi đáng trả lời. Giữ góc nhìn riêng của EmBe.</p></header><StudioDiscovery /><Link className="studio-back" href="/studio/nghien-cuu">Nguồn nghiên cứu & công cụ đã chọn</Link></main>;
}
