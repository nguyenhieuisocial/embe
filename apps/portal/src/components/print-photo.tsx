"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const PAPER_SIZES = {
  a4: { label: "A4", widthMm: 210, heightMm: 297, marginMm: 8 },
  a5: { label: "A5", widthMm: 148, heightMm: 210, marginMm: 7 },
  "photo-10x15": { label: "Ảnh 10 × 15 cm", widthMm: 100, heightMm: 150, marginMm: 0 },
  "photo-13x18": { label: "Ảnh 13 × 18 cm", widthMm: 130, heightMm: 180, marginMm: 0 }
} as const;

type PaperKey = keyof typeof PAPER_SIZES;
type Orientation = "portrait" | "landscape";

function bestOrientation(image: { width: number; height: number } | null, paper: typeof PAPER_SIZES[PaperKey]): Orientation {
  if (!image || image.width <= 0 || image.height <= 0) return "portrait";
  const portraitScale = Math.min(
    (paper.widthMm - paper.marginMm * 2) / image.width,
    (paper.heightMm - paper.marginMm * 2) / image.height
  );
  const landscapeScale = Math.min(
    (paper.heightMm - paper.marginMm * 2) / image.width,
    (paper.widthMm - paper.marginMm * 2) / image.height
  );
  return landscapeScale > portraitScale ? "landscape" : "portrait";
}

export default function PrintPhoto({ caption, id, title }: { caption: string; id: string; title: string }) {
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [paperKey, setPaperKey] = useState<PaperKey>("a4");
  const imageRef = useRef<HTMLImageElement>(null);
  const paper = PAPER_SIZES[paperKey];
  const orientation = bestOrientation(imageSize, paper);
  const pageWidth = orientation === "landscape" ? paper.heightMm : paper.widthMm;
  const pageHeight = orientation === "landscape" ? paper.widthMm : paper.heightMm;
  const printableWidth = pageWidth - paper.marginMm * 2;
  const printableHeight = pageHeight - paper.marginMm * 2;

  function markImageReady(image: HTMLImageElement): void {
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    setImageState("ready");
  }

  function selectPaper(nextPaper: PaperKey): void {
    setPaperKey(nextPaper);
    window.localStorage.setItem("embe-print-paper", nextPaper);
  }

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) {
      if (image.naturalWidth > 0) markImageReady(image);
      else setImageState("error");
    }
    const savedPaper = window.localStorage.getItem("embe-print-paper");
    if (savedPaper && savedPaper in PAPER_SIZES) setPaperKey(savedPaper as PaperKey);
    document.body.classList.add("print-photo-mode");
    return () => document.body.classList.remove("print-photo-mode");
  }, []);

  return (
    <main className="print-photo-main">
      <style>{`@media print { @page { size: ${pageWidth}mm ${pageHeight}mm; margin: ${paper.marginMm}mm; } body.print-photo-mode .print-photo-frame img { max-width: ${printableWidth}mm; max-height: ${printableHeight}mm; } }`}</style>
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
        <fieldset className="print-photo-paper">
          <legend>Khổ giấy đang dùng</legend>
          <div>
            {(Object.entries(PAPER_SIZES) as Array<[PaperKey, typeof PAPER_SIZES[PaperKey]]>).map(([key, value]) => (
              <button aria-pressed={paperKey === key} key={key} onClick={() => selectPaper(key)} type="button">{value.label}</button>
            ))}
          </div>
          <p>{imageSize ? `${imageSize.width > imageSize.height ? "Ảnh ngang" : "Ảnh dọc"} · tự xoay ${orientation === "landscape" ? "ngang" : "dọc"}` : "Đang nhận chiều ảnh…"}</p>
        </fieldset>
        <button disabled={imageState !== "ready"} onClick={() => window.print()} type="button">Mở AirPrint</button>
        <p>Chọn đúng khổ đang lắp trong máy in. EmBe giữ toàn bộ ảnh, tự xoay và căn vừa một trang; trong AirPrint hãy giữ cùng khổ giấy nếu được hỏi lại.</p>
      </div>
    </main>
  );
}
