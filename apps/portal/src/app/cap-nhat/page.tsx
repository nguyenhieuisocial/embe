import Link from 'next/link';
import AppHeader from '../../components/app-header';
import { APP_UPDATES } from '../../lib/app-updates';

export default function UpdatesPage() {
  return <main className="page settings-main">
    <AppHeader note="Cập nhật ứng dụng" />
    <h1>Có gì mới trong EmBe?</h1>
    <p className="intro">Những thay đổi đã đưa lên ứng dụng. Đây là cập nhật tính năng, không phải lịch sử sức khỏe của gia đình.</p>
    {APP_UPDATES.map(release => <section className="section" key={release.id} id={release.id}>
      <time dateTime={release.date}>{release.date.split('-').reverse().join('/')}</time>
      <h2>{release.title}</h2>
      {release.items.map(item => <article key={item.title} className="settings-group" style={{padding:16,marginBottom:12,overflowWrap:'anywhere'}}>
        <h3>{item.title}</h3><p>{item.description}</p>
        <Link className="btn btn-quiet" href={item.href}>{item.action}</Link>
      </article>)}
    </section>)}
    <Link className="btn btn-quiet" href="/cai-dat">Về Cài đặt</Link>
  </main>;
}
