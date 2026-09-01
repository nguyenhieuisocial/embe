"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function PrintPhoto({ caption, id, title }: { caption: string; id: string; title: string }) {
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const imageRef = useRef<HTMLImageElement>(null);

  function markImageReady(image: HTMLImageElement): void {
    setOrientation(image.naturalWidth > image.naturalHeight ? "landscape" : "portrait");
    setImageState("ready");
  }

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) {
      if (image.naturalWidth > 0) markImageReady(image);
      else setImageState("error");
    }
    document.body.classList.add("print-photo-mode");
    return () => document.body.classList.remove("print-photo-mode");
  }, []);

  return (
    <main className="print-photo-main">
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 13mm; } body.print-photo-mode .print-photo-frame img { max-height: ${orientation === "landscape" ? "180mm" : "268mm"}; } }`}</style>
      <header className="print-photo-header">
        <Link href="/ky-niem">‹ Kỷ niệm</Link>
        <div><p>Chuẩn bị in</p><h1>{title}</h1></div>
      </header>
      <figure className="print-photo-sheet">
        <div className="print-photo-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={title} onError={() => setImageState("error")} onLoad={(event) => markImageReady(event.currentTarget)} ref={imageRef} src={`/api/media/${id}`} />
          {imageState === "loading" ? <span role="status">Đang mở ảnh…</span> : null}
          {imageState === "error" ? <span role="alert">Chưa mở được ảnh. Hãy quay lại và thử lại.</span> : null}
        </div>
        <figcaption>{caption}</figcaption>
      </figure>
      <div className="print-photo-actions">
        <button disabled={imageState !== "ready"} onClick={() => window.print()} type="button">Mở AirPrint</button>
        <p>Ảnh sẽ tự căn giữa trang. Trên iPhone, chọn máy in và khổ giấy trong màn hình tiếp theo.</p>
      </div>
    </main>
  );
}
