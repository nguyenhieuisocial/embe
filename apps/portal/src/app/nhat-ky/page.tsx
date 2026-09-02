import Link from "next/link";

import AppHeader from "../../components/app-header";
import JournalBrowser from "../../components/journal-browser";
import { getTimeline } from "../../lib/timeline";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const events = await getTimeline(200);
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
