"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './medical-document-viewer.css';
import PhotoViewerImage from './photo-viewer-image';
import { trapViewerFocus } from './viewer-focus';

type DocumentFile = { id: string; originalFilename: string; displayName?: string; mimeType: string };
type FamilyScope = { memberId: string; recordId: string };
const HISTORY_KEY = 'embeMedicalViewer';

/** Keep originals private and inside EmBe, including when opened from an unsaved form. */
export default function MedicalDocumentButton({ document: item, documents = [item], children, className = '', pageNumber = 1, familyScope }: {
  document: DocumentFile; documents?: DocumentFile[]; children?: ReactNode; className?: string; pageNumber?: number;
  familyScope?: FamilyScope;
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
    }}>{children ?? item.displayName ?? `${item.mimeType === 'application/pdf' ? 'PDF' : 'Ảnh'} · ${item.originalFilename}`}</button>
    {open ? <MedicalDocumentViewer documents={documents.length ? documents : [item]} initialId={item.id} pageNumber={pageNumber} familyScope={familyScope}
      token={open} onClose={() => { setOpen(null); trigger.current?.focus({ preventScroll: true }); }} /> : null}
  </>;
}

function MedicalDocumentViewer({ documents, initialId, pageNumber, token, onClose, familyScope }: {
  documents: DocumentFile[]; initialId: string; pageNumber: number; token: string; onClose: () => void;
  familyScope?: FamilyScope;
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
        const url = familyScope ? `/api/family/members/${encodeURIComponent(familyScope.memberId)}/records/${encodeURIComponent(familyScope.recordId)}/documents/${encodeURIComponent(item.id)}` : `/api/pregnancy/documents/${item.id}`;
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
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
  }, [item.id, item.originalFilename, attempt, familyScope?.memberId, familyScope?.recordId]);

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

  return createPortal(<dialog ref={dialog} className="medical-viewer" aria-label="Xem tài liệu hồ sơ" onKeyDown={trapViewerFocus} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="medical-viewer-layout">
      <header className="medical-viewer-header">
        <button ref={back} type="button" onClick={close} aria-label="Quay lại hồ sơ"><span aria-hidden="true">‹</span> Quay lại</button>
        <div><strong>{item.originalFilename}</strong><small>{isPdf ? 'PDF' : 'Ảnh gốc'}{documents.length > 1 ? ` · ${index + 1}/${documents.length}` : ''}</small></div>
      </header>
      <div className="medical-viewer-content">
        {error ? <div className="medical-viewer-notice" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Thử tải lại</button></div>
          : !current ? <p className="medical-viewer-notice" role="status">Đang tải bản gốc…</p>
            : isPdf ? <iframe className="medical-viewer-pdf" title={`PDF · ${item.originalFilename}`} src={`${current.url}#page=${item.id === initialId ? pageNumber : 1}`} />
              : <PhotoViewerImage key={current.url} src={current.url} title={item.originalFilename} rotatable fitLabel="Vừa khung ảnh" showNavigation={false}
                onMove={direction => setIndex(value => Math.max(0, Math.min(documents.length - 1, value + direction)))} onError={() => setError('Chưa hiển thị được ảnh. Thử tải lại hoặc lưu bản gốc về máy.')} />}
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
