import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PublicShareActions from "../../../components/public-share-actions";
import { getMediaMemory } from "../../../lib/media";
import { verifyMediaShareToken } from "../../../lib/share-token";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };

async function sharedMemory(token: string) {
  const shared = verifyMediaShareToken(token);
  return shared ? getMediaMemory(shared.id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const memory = await sharedMemory(token);
  if (!memory) return { title: "Kỷ niệm không còn khả dụng · EmBe", robots: { index: false, follow: false } };
  const image = `https://embe.hieu.asia/api/public/media/${encodeURIComponent(token)}`;
  return {
    title: `${memory.title} · EmBe`,
    description: memory.caption || "Một kỷ niệm từ gia đình Hiếu – Ngân.",
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title: memory.title, description: memory.caption, images: [{ url: image }], type: "article" }
  };
}

export default async function SharedMemoryPage({ params }: Props) {
  const { token } = await params;
  const memory = await sharedMemory(token);
  if (!memory) notFound();
  const imageUrl = `/api/public/media/${encodeURIComponent(token)}`;
  const date = new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(memory.eventAt));

  return <main className="public-share-page">
    <header><span>EmBe</span><small>Kỷ niệm được chia sẻ riêng</small></header>
    <article>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={memory.title} height={memory.height ?? 900} src={imageUrl} width={memory.width ?? 1200} />
      <div><time dateTime={memory.eventAt}>{date}</time><h1>{memory.title}</h1>{memory.caption ? <p>{memory.caption}</p> : null}</div>
    </article>
    <PublicShareActions imageUrl={imageUrl} title={memory.title} />
    <p className="public-share-expiry">Link riêng này tự hết hạn sau 7 ngày và không mở các nội dung khác của gia đình.</p>
  </main>;
}
