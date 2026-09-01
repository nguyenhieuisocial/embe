"use client";

export default function PublicShareActions({ imageUrl, title }: { imageUrl: string; title: string }) {
  async function share(): Promise<void> {
    if (navigator.share) {
      await navigator.share({ title, text: "Một kỷ niệm từ gia đình Hiếu – Ngân", url: window.location.href }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(window.location.href);
  }

  return <div className="public-share-actions">
    <button onClick={() => void share()} type="button">↗ Chia sẻ tiếp</button>
    <a download href={imageUrl}>↓ Lưu ảnh</a>
  </div>;
}
