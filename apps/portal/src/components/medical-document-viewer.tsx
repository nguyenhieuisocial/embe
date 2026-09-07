"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './medical-document-viewer.css';

type DocumentFile = { id: string; originalFilename: string; mimeType: string };
const HISTORY_KEY = 'embeMedicalViewer';

/** Keep originals private and inside EmBe, including when opened from an unsaved form. */
export default function MedicalDocumentButton({ document: item, documents = [item], children, className = '', pageNumber = 1 }: {
  document: DocumentFile; documents?: DocumentFile[]; children?: ReactNode; className?: string; pageNumber?: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className={`medical-document-trigger ${className}`} aria-haspopup="dialog" onClick={() => {
      const token = crypto.randomUUID();
      // A same-URL entry lets browser/iOS Back close the viewer without losing the form.
      // Do this in the gesture, not an effect (which is replayed by React StrictMode).
      window.history.pushState({ ...window.history.state, [HISTORY_KEY]: token }, '', window.location.href);
      setOpen(token);
    }}>{children ?? `${item.mimeType === 'application/pdf' ? 'PDF' : 'Ảnh'} · ${item.originalFilename}`}</button>
    {open ? <MedicalDocumentViewer documents={documents.length ? documents : [item]} initialId={item.id} pageNumber={pageNumber}
      token={open} onClose={() => { setOpen(null); trigger.current?.focus({ preventScroll: true }); }} /> : null}
  </>;
}

function MedicalDocumentViewer({ documents, initialId, pageNumber, token, onClose }: {
  documents: DocumentFile[]; initialId: string; pageNumber: number; token: string; onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.max(0, documents.findIndex(item => item.id === initialId)));
  const item = documents[index] ?? documents[0];
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const closing = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ id: string; url: string; file: File } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const current = loaded?.id === item.id ? loaded : null;
  const isPdf = item.mimeType === 'application/pdf';

  function close() {
    if (closing.current) return;
    closing.current = true;
    if (window.history.state?.[HISTORY_KEY] === token) window.history.back();
    closeRef.current();
  }

  useEffect(() => {
    const element = dialog.current!;
    const y = window.scrollY; const x = window.scrollX;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = { position: document.body.style.position, top: document.body.style.top,
      left: document.body.style.left, width: document.body.style.width, overflow: document.body.style.overflow };
    Object.assign(document.body.style, { position: 'fixed', top: `-${y}px`, left: `-${x}px`, width: '100%', overflow: 'hidden' });
    element.showModal(); back.current?.focus({ preventScroll: true });
    const pop = () => { if (window.history.state?.[HISTORY_KEY] !== token) { closing.current = true; closeRef.current(); } };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      element.close(); Object.assign(document.body.style, previous);
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
      previousFocus?.focus({ preventScroll: true });
      // A route change/unmount must never leave a stale modal marker in the router state.
      queueMicrotask(() => {
        if (!element.isConnected && !closing.current && window.history.state?.[HISTORY_KEY] === token) {
          const state = { ...window.history.state }; delete state[HISTORY_KEY];
          window.history.replaceState(state, '', window.location.href);
        }
      });
    };
  }, [token]);

  useEffect(() => {
    const controller = new AbortController(); let disposed = false; let objectUrl: string | undefined;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    setLoaded(null); setError(''); setMessage(''); setCanShare(false);
    void (async () => {
      try {
        const response = await fetch(`/api/pregnancy/documents/${item.id}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Phiên đăng nhập đã hết. Quay lại hồ sơ để đăng nhập lại.'
          : response.status === 404 ? 'Tài liệu không còn trong hồ sơ. Bạn vẫn có thể quay lại.' : 'Chưa tải được tài liệu. Kiểm tra mạng rồi thử lại.');
        const blob = await response.blob();
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(blob.type.split(';')[0]) || !blob.size || blob.size > 15000000) {
          throw new Error('File chưa đúng định dạng ảnh hoặc PDF. Quay lại để kiểm tra tài liệu.');
        }
        if (disposed) return;
        const file = new File([blob], item.originalFilename, { type: blob.type });
        objectUrl = URL.createObjectURL(file);
        setLoaded({ id: item.id, url: objectUrl, file });
        setCanShare(typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] })));
      } catch (e) {
        if (!disposed) setError(controller.signal.aborted ? 'Tải lâu hơn dự kiến. Thử lại khi mạng ổn định; không cần tải ảnh lên lần nữa.'
          : e instanceof TypeError ? 'Chưa tải được tài liệu. Kiểm tra mạng rồi thử lại.' : (e as Error).message);
      } finally { window.clearTimeout(timeout); }
    })();
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.id, item.originalFilename, attempt]);

  function download() {
    if (!current) return;
    const anchor = document.createElement('a'); anchor.href = current.url; anchor.download = current.file.name;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setMessage('Đã gửi file tới trình duyệt để tải xuống. Trên iPhone, xem trong ứng dụng Tệp.');
  }
  async function share() {
    if (!current || !canShare || sharing) return;
    setSharing(true); setMessage('');
    try {
      // File is already loaded, so iOS still has the required user activation here.
      await navigator.share({ files: [current.file] });
      setMessage('Đã chuyển file sang bảng chia sẻ.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMessage('Chưa chia sẻ được. Có thể tải file xuống rồi gửi bằng ứng dụng khác.');
    } finally { setSharing(false); }
  }

  return createPortal(<dialog ref={dialog} className="medical-viewer" aria-label="Xem tài liệu hồ sơ" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="medical-viewer-layout">
      <header className="medical-viewer-header">
        <button ref={back} type="button" onClick={close} aria-label="Quay lại hồ sơ"><span aria-hidden="true">‹</span> Quay lại</button>
        <div><strong>{item.originalFilename}</strong><small>{isPdf ? 'PDF' : 'Ảnh gốc'}{documents.length > 1 ? ` · ${index + 1}/${documents.length}` : ''}</small></div>
      </header>
      <div className="medical-viewer-content">
        {error ? <div className="medical-viewer-notice" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Thử tải lại</button></div>
          : !current ? <p className="medical-viewer-notice" role="status">Đang tải bản gốc…</p>
            : isPdf ? <iframe className="medical-viewer-pdf" title={`PDF · ${item.originalFilename}`} src={`${current.url}#page=${item.id === initialId ? pageNumber : 1}`} />
              : <DocumentImage key={current.url} src={current.url} filename={item.originalFilename} onError={() => setError('Chưa hiển thị được ảnh. Thử tải lại hoặc lưu bản gốc về máy.')} />}
      </div>
      <footer className="medical-viewer-footer">
        {documents.length > 1 ? <nav aria-label="Tài liệu trong hồ sơ"><button type="button" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>‹ Trước</button>
          <span>{index + 1} / {documents.length}</span><button type="button" disabled={index === documents.length - 1} onClick={() => setIndex(value => value + 1)}>Sau ›</button></nav> : null}
        <div className="medical-viewer-file-actions">
          <button type="button" disabled={!current} onClick={download}>Tải xuống</button>
          {canShare ? <button type="button" disabled={!current || sharing} onClick={() => void share()}>{isPdf ? 'Chia sẻ PDF' : 'Chia sẻ / lưu ảnh'}</button> : null}
          <button type="button" className="medical-viewer-done" onClick={close}>Đóng</button>
        </div>
        <p role="status">{message || (isPdf ? 'PDF trống? Tải xuống hoặc chia sẻ để mở trong ứng dụng đọc PDF.' : canShare ? 'Chọn Chia sẻ → Lưu hình ảnh để lưu vào Ảnh trên iPhone.' : 'Bản gốc giữ riêng trong hồ sơ. Chỉ gửi cho người được phép xem.')}</p>
      </footer>
    </div>
  </dialog>, document.body);
}

// Same bounded pointer/pinch interaction used in the family photo viewer, without album/edit/public-share actions.
function DocumentImage({ src, filename, onError }: { src: string; filename: string; onError: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; zoom: number; x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const swapped = rotation % 180 !== 0;
  const fit = Math.min(size.width / (swapped ? natural.height : natural.width), size.height / (swapped ? natural.width : natural.height));
  function bound(x: number, y: number, scale = zoom) {
    const maxX = Math.max(0, (fit * (swapped ? natural.height : natural.width) * scale - size.width) / 2);
    const maxY = Math.max(0, (fit * (swapped ? natural.width : natural.height) * scale - size.height) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }
  function scale(value: number) { const next = Math.max(1, Math.min(4, value)); setZoom(next); setOffset(value => bound(value.x, value.y, next)); }
  function reset() { setZoom(1); setOffset({ x: 0, y: 0 }); }
  useEffect(() => {
    const resize = () => { if (stage.current) { setSize({ width: stage.current.clientWidth, height: stage.current.clientHeight }); reset(); } };
    resize(); const observer = new ResizeObserver(resize); observer.observe(stage.current!);
    return () => observer.disconnect();
  }, []);
  function begin() {
    const [a, b] = [...points.current.values()];
    gesture.current = a ? { distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, zoom, x: a.x, y: a.y, offset } : null;
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(event.pointerId) || !gesture.current) return;
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const [a, b] = [...points.current.values()]; const start = gesture.current;
    if (b && start.distance) scale(start.zoom * Math.hypot(a.x - b.x, a.y - b.y) / start.distance);
    else if (!b) setOffset(bound(start.offset.x + a.x - start.x, start.offset.y + a.y - start.y));
  }
  return <div className="medical-image-view">
    <div ref={stage} className="medical-image-stage" role="region" aria-label="Ảnh hồ sơ, phóng to và kéo để xem" tabIndex={0}
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); points.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); begin(); }}
      onPointerMove={move} onPointerUp={event => { points.current.delete(event.pointerId); begin(); }} onPointerCancel={event => { points.current.delete(event.pointerId); begin(); }}
      onDoubleClick={() => zoom > 1 ? reset() : scale(2)} onKeyDown={event => {
        if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
        if (event.key === '+' || event.key === '=') scale(zoom + .5);
        if (event.key === '-') scale(zoom - .5);
        if (event.key === '0') reset();
        if (event.key.startsWith('Arrow')) setOffset(bound(offset.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0), offset.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0)));
      }}>
      {/* Private object URL, never an image optimizer/public cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={filename} draggable={false} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={onError}
        style={{ width: natural.width * fit, height: natural.height * fit, transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})` }} />
    </div>
    <div className="medical-viewer-zoom" role="group" aria-label="Điều khiển ảnh hồ sơ">
      <button type="button" aria-label="Thu nhỏ ảnh" disabled={zoom <= 1} onClick={() => scale(zoom - .5)}>−</button>
      <button type="button" aria-label="Vừa khung ảnh" onClick={reset}>{Math.round(zoom * 100)}%</button>
      <button type="button" aria-label="Phóng to ảnh" disabled={zoom >= 4} onClick={() => scale(zoom + .5)}>+</button>
      <button type="button" aria-label="Xoay ảnh" onClick={() => { setRotation(value => (value + 90) % 360); reset(); }}>↻ Xoay</button>
    </div>
  </div>;
}
