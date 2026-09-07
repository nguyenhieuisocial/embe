import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppHeader from '../../../components/app-header';
import StudioPlayer from '../../../components/studio-player';
import StudioActions from '../../../components/studio-actions';
import StudioNav from '../../../components/studio-nav';
import { studioInfo, studioScript, studioTopic } from '../../../lib/studio';
import '../studio.css';

export default async function StudioDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const topic = studioTopic(slug); if (!topic) notFound();
  return <main className="page studio-main studio-detail">
    <AppHeader note="EmBe Mẹ Bầu" />
    <StudioNav />
    <Link href="/studio" className="studio-back">‹ Tất cả chủ đề</Link>
    <header className="studio-heading"><p>{topic.pillar}</p><h1>{topic.title}</h1><p>{topic.stage} · {topic.duration} giây</p></header>
    <aside className="studio-notice"><strong>Bản nháp, chưa duyệt chuyên môn</strong><p>Thông tin tham khảo, không thay tư vấn y tế cá nhân.</p></aside>
    <StudioPlayer slug={slug} title={topic.title} audio={topic.audio} />
    <Link className="studio-back" href={`/studio/soan?mau=${slug}`}>Sửa kịch bản & dựng bản riêng</Link>
    <StudioActions slug={slug} script={studioScript(topic)} caption={`${topic.caption}\n${topic.hashtags.map(tag => `#${tag}`).join(' ')}`} />
    <section className="studio-script" aria-labelledby="script-heading"><h2 id="script-heading">Kịch bản từng cảnh</h2>
      <ol>{topic.beats.map(beat => <li key={beat.start}><span className="studio-time">{beat.start}–{beat.end}s</span><div><h3>{beat.heading}</h3><p>{beat.text}</p></div></li>)}</ol>
    </section>
    <details className="studio-disclosure"><summary>Mở đầu khác & caption</summary><h3>Cách mở đầu khác</h3><p>{topic.hookB}</p><h3>Caption</h3><p>{topic.caption}</p><p>{topic.hashtags.map(tag => `#${tag}`).join(' ')}</p></details>
    <details className="studio-disclosure"><summary>Nguồn đối chiếu ({topic.sources.length})</summary>
      <p>Đọc nguồn ngày {(topic.checkedAt ?? studioInfo.checkedAt).split('-').reverse().join('/')}. Đây không phải xác nhận đã duyệt y khoa.</p>
      <ul>{topic.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.publisher} — {source.title}</a><p>{source.jurisdiction}</p></li>)}</ul>
    </details>
    {topic.voiceCredit && <details className="studio-disclosure"><summary>Minh họa & giọng đọc</summary>
      <p>Minh họa gốc tạo bằng ChatGPT. Giọng tổng hợp tiếng Việt chạy cục bộ, không sao chép giọng người trong video tham khảo.</p>
      <p>{topic.voiceCredit.attribution}</p><p><a href={topic.voiceCredit.url} target="_blank" rel="noreferrer">Nguồn mô hình giọng đọc</a> · <a href={topic.voiceCredit.license} target="_blank" rel="noreferrer">Giấy phép CC BY 4.0</a></p>
    </details>}
  </main>;
}
