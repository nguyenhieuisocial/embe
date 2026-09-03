import Link from "next/link";

import AppHeader from "../../components/app-header";
import JournalBrowser from "../../components/journal-browser";
import { getPendingJournalEntries, getTimeline } from "../../lib/timeline";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const [published, pending] = await Promise.all([
    getTimeline(200),
    getPendingJournalEntries(50)
  ]);
  const events = [...pending, ...published]
    .sort((left, right) => new Date(right.eventAt).getTime() - new Date(left.eventAt).getTime())
    .slice(0, 200);
  return (
    <main className="page journal-view-page">
      <AppHeader note="Chỉ gia đình nhìn thấy" />
      <header className="journal-view-hero">
        <div><p className="eyebrow">Chuyện nhà mình</p><h1>Nhật ký</h1><p>Xem lại theo cách dễ nhớ nhất.</p></div>
        <Link href="/ghi-lai">＋ Ghi lại</Link>
      </header>
      <JournalBrowser events={events} />
    </main>
  );
}
