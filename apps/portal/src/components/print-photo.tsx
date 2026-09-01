"use client";

import Link from "next/link";
import { useState } from "react";

export default function PrintPhoto({ caption, id, title }: { caption: string; id: string; title: string }) {
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");

  return (
    <main className="print-photo-main">
      <header className="print-photo-header">
        <Link href="/ky-niem">‹ Kỷ niệm</Link>
        <div><p>Chuẩn bị in</p><h1>{title}</h1></div>
      </header>
      <figure className="print-photo-sheet">
        <div className="print-photo-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={title} onError={() => setImageState("error")} onLoad={() => setImageState("ready")} src={`/api/media/${id}`} />
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
