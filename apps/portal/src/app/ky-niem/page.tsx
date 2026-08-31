import { getMediaMemories } from "../../lib/media";

export const dynamic = "force-dynamic";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export default async function MemoriesPage() {
  const memories = await getMediaMemories();
  return (
    <main className="memories-main">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="EmBe — về trang gia đình">EmBe</a>
        <p className="privacy-note"><span aria-hidden="true">●</span> Chỉ ảnh bố mẹ đã chọn</p>
      </header>
      <section className="memories-hero">
        <p className="eyebrow">ALBUM CỦA GIA ĐÌNH</p>
        <h1>Những ngày<br /><em>mình muốn nhớ</em></h1>
        <p className="intro">Ảnh gốc vẫn ở máy nhà. EmBe chỉ hiện bản xem nhẹ đã được bố mẹ duyệt.</p>
      </section>
      {memories.length ? (
        <section className="memory-grid" aria-label="Ảnh kỷ niệm gia đình">
          {memories.map((memory) => (
            <article className="memory-card" key={memory.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/media/${memory.id}`} alt={memory.title} loading="lazy" />
              <div><time dateTime={memory.eventAt}>{dateLabel(memory.eventAt)}</time><h2>{memory.title}</h2><p>{memory.caption}</p></div>
            </article>
          ))}
        </section>
      ) : (
        <section className="memory-empty" role="status">
          <span aria-hidden="true">◎</span>
          <h2>Chưa có ảnh được chọn</h2>
          <p>Mẹ Ngân hoặc Ba Hiếu chọn ảnh trong album gia đình trước. EmBe sẽ tự đưa bản xem nhẹ vào đây sau khi đồng bộ.</p>
          <a href="/huong-dan#iphone-title">Xem cách đưa ảnh từ iPhone</a>
        </section>
      )}
    </main>
  );
}
