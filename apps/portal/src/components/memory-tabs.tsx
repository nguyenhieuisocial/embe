export default function MemoryTabs({ current }: { current: "calendar" | "album" }) {
  return (
    <nav className="memory-tabs" aria-label="Lịch và kỷ niệm">
      <a aria-current={current === "calendar" ? "page" : undefined} href="/lich">Lịch gia đình</a>
      <a aria-current={current === "album" ? "page" : undefined} href="/ky-niem">Album kỷ niệm</a>
    </nav>
  );
}
