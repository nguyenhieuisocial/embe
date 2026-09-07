"use client";

import { useRef, useState } from 'react';
import StudioFileShare from './studio-file-share';

export default function StudioActions({ slug, script, caption }: { slug: string; script: string; caption: string }) {
  const [message, setMessage] = useState(''); const [manual, setManual] = useState('');
  const fallback = useRef<HTMLTextAreaElement>(null);
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setManual(''); setMessage(`Đã chép ${label}.`); }
    catch { setManual(value); setMessage('Chạm vào ô bên dưới để chọn và sao chép.'); }
  }
  return <section className="studio-actions" aria-label="Lưu nội dung">
    <StudioFileShare url={`/api/studio/${slug}/video`} title="EmBe Mẹ Bầu" filename={`embe-${slug}.mp4`} />
    <div className="studio-action-grid">
      <button type="button" onClick={() => void copy(script, 'kịch bản')}>Chép kịch bản</button>
      <button type="button" onClick={() => void copy(caption, 'caption')}>Chép caption</button>
      <a href={`/api/studio/${slug}/subtitles?download=1`} download>Tải phụ đề</a>
    </div>
    <p role="status" className="studio-copy-status">{message}</p>
    {manual && <label className="studio-search">Nội dung cần chép<textarea ref={fallback} readOnly value={manual} rows={5} onFocus={() => fallback.current?.select()} onClick={() => fallback.current?.select()} /></label>}
    <a className="studio-text-download" href={`/api/studio/${slug}/script?download=1`} download>Tải kịch bản dạng văn bản</a>
  </section>;
}
