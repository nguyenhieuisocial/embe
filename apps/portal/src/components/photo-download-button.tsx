"use client";

import { useState } from "react";

import type { MediaMemory } from "../lib/media";

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function PhotoDownloadButton({ memory }: { memory: MediaMemory }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function save(): Promise<void> {
    setState("saving");
    try {
      const response = await fetch(`/api/media/${memory.id}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const filename = `anh-embe-${memory.id.slice(0, 8)}.${extensionFor(memory.mimeType)}`;
      const file = new File([blob], filename, { type: memory.mimeType });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: memory.title });
      } else {
        downloadBlob(blob, filename);
      }
      setState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setState("idle");
      else setState("error");
    }
  }

  return <>
    <button aria-label="Lưu ảnh về máy" className="photo-viewer-download" disabled={state === "saving"} onClick={() => void save()} type="button">
      <span aria-hidden="true">↓</span><span className="photo-action-label">{state === "saving" ? "Đang lưu" : "Lưu"}</span>
    </button>
    <span aria-live="polite" className="sr-only">
      {state === "done" ? "Đã mở lựa chọn lưu ảnh." : state === "error" ? "Chưa lưu được ảnh. Hãy thử lại." : ""}
    </span>
  </>;
}
