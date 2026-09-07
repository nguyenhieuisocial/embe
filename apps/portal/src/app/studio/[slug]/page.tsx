import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppHeader from '../../../components/app-header';
import StudioPlayer from '../../../components/studio-player';
import StudioActions from '../../../components/studio-actions';
import { studioInfo, studioScript, studioTopic } from '../../../lib/studio';
import '../studio.css';

export default async function StudioDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const topic = studioTopic(slug); if (!topic) notFound();
  return <main className="page studio-main studio-detail">
    <AppHeader note="EmBe Mẹ Bầu" />
    <Link href="/studio" className="studio-back">‹ Tất cả chủ đề</Link>
    <header className="studio-heading"><p>{topic.pillar}</p><h1>{topic.title}</h1><p>{topic.stage} · {topic.duration} giây</p></header>
    <aside className="studio-notice"><strong>Bản nháp, chưa duyệt chuyên môn</strong><p>Thông tin tham khảo, không thay tư vấn y tế cá nhân.</p></aside>
    <StudioPlayer slug={slug} title={topic.title} />
    <StudioActions slug={slug} script={studioScript(topic)} caption={`${topic.caption}\n${topic.hashtags.map(tag => `#${tag}`).join(' ')}`} />
    <section className="studio-script" aria-labelledby="script-heading"><h2 id="script-heading">Kịch bản từng cảnh</h2>
      <ol>{topic.beats.map(beat => <li key={beat.start}><span className="studio-time">{beat.start}–{beat.end}s</span><div><h3>{beat.heading}</h3><p>{beat.text}</p></div></li>)}</ol>
    </section>
    <details className="studio-disclosure"><summary>Mở đầu khác & caption</summary><h3>Cách mở đầu khác</h3><p>{topic.hookB}</p><h3>Caption</h3><p>{topic.caption}</p><p>{topic.hashtags.map(tag => `#${tag}`).join(' ')}</p></details>
    <details className="studio-disclosure"><summary>Nguồn đối chiếu ({topic.sources.length})</summary>
      <p>Đọc nguồn ngày {studioInfo.checkedAt.split('-').reverse().join('/')}. Đây không phải xác nhận đã duyệt y khoa.</p>
      <ul>{topic.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.publisher} — {source.title}</a><p>{source.jurisdiction}</p></li>)}</ul>
    </details>
  </main>;
}
