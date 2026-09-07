"use client";

import { useState } from 'react';

export default function StudioPlayer({ slug, title, audio = false }: { slug: string; title: string; audio?: boolean }) {
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  return <div className="studio-player-wrap">
    <video key={attempt} className="studio-player" controls playsInline preload="none" aria-label={`Video nháp: ${title}`} poster={`/api/studio/${slug}/poster`}
      onError={() => setFailed(true)} onLoadedData={() => setFailed(false)}>
      <source src={`/api/studio/${slug}/video`} type="video/mp4" />
      <track kind="captions" src={`/api/studio/${slug}/subtitles`} srcLang="vi" label="Tiếng Việt" />
      Trình duyệt chưa phát được video này. Hãy dùng nút Tải video bên dưới.
    </video>
    {failed && <div className="studio-empty" role="alert"><p>Chưa tải được video. Kiểm tra mạng rồi thử lại.</p><button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Tải lại video</button></div>}
    <p className="studio-player-note">{audio ? 'Có giọng đọc AI tiếng Việt. Chạm phát, bật âm lượng để nghe.' : 'Bản chữ/hình, chưa có giọng đọc. Chạm phát để xem.'}</p>
  </div>;
}
