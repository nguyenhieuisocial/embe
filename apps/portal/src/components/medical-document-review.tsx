"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import MedicalDocumentImport from './medical-document-import';
import { DOCUMENT_TYPES, SCAN_ERROR_TEXT, documentAnalysisText, validDocumentAnalysis, withPrintedUnit,
  type DocumentAnalysis, type DocumentPage, type DocumentScan, type ExtractedField, type ExtractedMedicine, type ExtractedCharge } from '../lib/medical-document-scan';

const FIELD_LABELS: Record<string, string> = { label: 'Tên mục / chỉ số', value: 'Nội dung / kết quả', unit: 'Đơn vị trên phiếu', reference: 'Khoảng tham chiếu trên phiếu',
  name: 'Tên thuốc', ingredients: 'Thành phần / hàm lượng', dose: 'Liều ghi trên đơn', frequency: 'Số lần dùng', instructions: 'Cách dùng ghi trên đơn',
  amount: 'Số tiền nguyên văn', currency: 'Tiền tệ trên phiếu' };
const MAX: Record<string, number> = { label: 120, value: 1600, unit: 40, reference: 160, name: 100, ingredients: 1200, dose: 80, frequency: 80, instructions: 200, amount: 80, currency: 20 };
type Group = 'fields' | 'medicines' | 'charges';
type Row = ExtractedField | ExtractedMedicine | ExtractedCharge;
const emptyRow = (group: Group): Row => group === 'fields' ? { label: '', value: '', unit: '', reference: '', evidence: '', unclear: true }
  : group === 'medicines' ? { name: '', ingredients: '', dose: '', frequency: '', instructions: '', evidence: '', unclear: true }
    : { label: '', amount: '', currency: '', evidence: '', unclear: true };
const GROUPS: Record<Group, string> = { fields: 'Thông tin và chỉ số', medicines: 'Thuốc trên tài liệu', charges: 'Khoản thu và thanh toán' };
const EMPTY_LIMITS = { fields: 32, medicines: 12, charges: 40 };
const pageRows = (page: DocumentPage): Row[] => [...page.fields, ...page.medicines, ...page.charges];

function DocumentOriginal({ documentId, scan, pageNumber }: { documentId: string; scan: DocumentScan; pageNumber: number }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const url = `/api/pregnancy/documents/${documentId}`;
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(scan.mimeType);
  return <div className="document-source">
    {isImage ? <button className="document-source-toggle" type="button" aria-expanded={open} aria-controls="document-original-preview" onClick={() => setOpen(value => !value)}>
      {open ? 'Thu gọn bản gốc' : 'Xem bản gốc ngay tại đây'}
    </button> : null}
    {open && isImage ? <div id="document-original-preview">
      <div className="document-zoom" role="group" aria-label="Phóng to bản gốc">
        <button type="button" disabled={zoom <= 1} aria-label="Thu nhỏ bản gốc" onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Vừa khung bản gốc">{Math.round(zoom * 100)}%</button>
        <button type="button" disabled={zoom >= 3} aria-label="Phóng to bản gốc" onClick={() => setZoom(value => Math.min(3, value + .5))}>+</button>
        <small>Vuốt để xem khi phóng to</small>
      </div>
      {failed ? <p role="status">Chưa tải được ảnh. Dùng liên kết mở bản gốc bên dưới.</p> : <div className="document-image-scroll" tabIndex={0} role="region" aria-label="Ảnh tài liệu gốc, có thể cuộn">
        {/* Authenticated original: no public image optimizer or persisted browser copy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Bản gốc tài liệu để đối chiếu" style={{ width: `${zoom * 100}%` }} onError={() => setFailed(true)} />
      </div>}
    </div> : null}
    <a className="document-original" href={isImage ? url : `${url}#page=${pageNumber}`} target="_blank" rel="noreferrer">Mở bản gốc · {scan.filename}</a>
  </div>;
}

export default function MedicalDocumentReview({ documentId }: { documentId: string }) {
  const endpoint = `/api/pregnancy/documents/${documentId}/scan`;
  const [scan, setScan] = useState<DocumentScan | null>(null);
  const [draft, setDraft] = useState<DocumentAnalysis | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const [selectedPage, setSelectedPage] = useState(0);
  const [onlyUnclear, setOnlyUnclear] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Không tìm thấy tài liệu, hoặc hồ sơ đã được xóa.' : 'Chưa tải được tài liệu. Kiểm tra kết nối rồi thử lại.');
    const value: DocumentScan = await response.json();
    if (value.analysis && !validDocumentAnalysis(value.analysis)) throw new Error('Bản đọc chưa đúng cấu trúc. Bản gốc vẫn còn nguyên.');
    setScan(value); setDraft(value.analysis); setDirty(false); setConfirmed(false); setConflict(false); setSelectedPage(0);
    return value;
  }, [endpoint]);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!scan || !['queued', 'processing'].includes(scan.status)) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const response = await fetch(endpoint, { cache: 'no-store' });
          if (!response.ok) throw new Error('network');
          const value: DocumentScan = await response.json();
          if (!stopped) {
            setScan(value);
            if (value.analysis && validDocumentAnalysis(value.analysis)) setDraft(value.analysis);
            setError('');
          }
        } catch { if (!stopped) setError('Chưa cập nhật được tiến độ. File vẫn được lưu, không cần tải lại.'); }
      }
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [endpoint, scan?.status]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function changePage(index: number, update: (page: DocumentPage) => DocumentPage) {
    setDraft(current => current ? { ...current, pages: current.pages.map((page, i) => i === index ? update(page) : page) } : current);
    setDirty(true); setConfirmed(false); setMessage('');
  }
  function changeRow(pageIndex: number, group: Group, rowIndex: number, field: string, value: string | boolean) {
    changePage(pageIndex, page => ({ ...page, [group]: page[group].map((row, i) => i === rowIndex ? { ...row, [field]: value } : row) }));
  }
  async function queue() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('Chưa bắt đầu đọc được. Bản gốc vẫn được giữ trong hồ sơ.');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (!confirmed || !draft || !scan || lock.current || busy) return;
    if (!validDocumentAnalysis(draft)) { setError('Bản nhập quá dài hoặc có trường không hợp lệ. Rút gọn nội dung rồi lưu lại.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: scan.revision, analysis: draft, confirmed: true }) });
      if (response.status === 409) { setConflict(true); throw new Error('Tài liệu đã được cập nhật trên thiết bị khác. Bản đang sửa vẫn còn ở đây; xem bản mới trước khi lưu.'); }
      if (!response.ok) throw new Error('Chưa lưu được. Nội dung đang sửa vẫn còn; hãy thử lại khi có mạng.');
      const saved: DocumentScan = await response.json();
      if (!saved.analysis || !validDocumentAnalysis(saved.analysis) || saved.status !== 'confirmed') {
        throw new Error('Chưa xác minh được phản hồi lưu. Nội dung đang sửa vẫn còn; hãy tải lại sau khi chép phần cần giữ.');
      }
      setScan(saved); setDraft(saved.analysis); setDirty(false); setConfirmed(false);
      setMessage('Đã lưu bản đối chiếu vào tài liệu này.');
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function copy() {
    if (!draft) return;
    try { await navigator.clipboard.writeText(documentAnalysisText(draft, scan?.status === 'confirmed' && !dirty)); setMessage('Đã chép nội dung và các dấu cần kiểm tra lại. Chỉ chia sẻ cho người được phép xem hồ sơ.'); }
    catch { setMessage('Trình duyệt chưa cho sao chép. Có thể chọn chữ trong các trường để chép.'); }
  }
  return <section className="document-review" aria-label="Đối chiếu tài liệu y tế">
    <Link className="document-back" href="/me-bau/ho-so#ho-so-kham" onClick={event => {
      if (dirty && !window.confirm('Thay đổi chưa lưu. Rời trang và bỏ phần đang sửa?')) event.preventDefault();
    }}>‹ Hồ sơ thai kỳ</Link>
    <h1>Đọc & đối chiếu</h1>
    <p className="document-intro">Chép đúng giấy tờ, giữ nguyên bản gốc.</p>
    {!scan && !error ? <p role="status">Đang mở tài liệu…</p> : null}
    {scan ? <>
      <DocumentOriginal documentId={documentId} scan={scan} pageNumber={selectedPage + 1} />
      <p className="document-state" role="status">{scan.status === 'confirmed' ? 'Đã xác nhận' : scan.status === 'review' ? 'Đã đọc · cần đối chiếu' : scan.status === 'processing'
        ? `Đang đọc trang ${scan.completedPages + 1}${scan.pageCount ? `/${scan.pageCount}` : ''} trên máy tại nhà` : scan.status === 'queued' ? 'Đã xếp hàng · chờ máy tại nhà' : scan.status === 'failed' ? 'Chưa đọc xong' : 'Chưa đọc tự động'}</p>
      {scan.status === 'idle' || scan.status === 'failed' ? <div className="document-start">
        <p>{scan.error ? SCAN_ERROR_TEXT[scan.error] ?? 'Lượt đọc bị gián đoạn. Thử lại hoặc xem bản gốc để nhập thủ công.' : 'Ảnh hoặc PDF tối đa 6 trang. Mỗi trang được phân loại riêng; chữ không rõ sẽ được đánh dấu.'}</p>
        <button disabled={busy} onClick={() => void queue()}>{busy ? 'Đang gửi…' : scan.status === 'failed' ? 'Đọc lại tài liệu' : 'Đọc tài liệu'}</button>
      </div> : null}
      {scan.status === 'queued' && scan.error ? <p>{SCAN_ERROR_TEXT[scan.error] ?? 'Máy đang chờ kết nối để thử lại.'}</p> : null}
    </> : null}
    {error ? <div role="alert" className="document-notice">{error}
      {!scan ? <button onClick={() => void load().then(() => setError('')).catch(e => setError(e.message))}>Thử tải lại</button> : null}
      {conflict ? <button onClick={() => {
        if (!dirty || window.confirm('Nạp bản mới sẽ thay phần đang sửa. Anh/chị đã chép lại phần cần giữ chưa?')) void load().then(() => setError('')).catch(e => setError(e.message));
      }}>Nạp bản đã lưu mới nhất</button> : null}
    </div> : null}
    {draft ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {scan ? <MedicalDocumentImport documentId={documentId} recordId={scan.recordId} revision={scan.revision} analysis={draft} disabled={busy} onBusy={setBusy} onDirty={() => setDirty(true)}
        onImported={async () => { await load(); setMessage('Đã lưu bản đọc và thêm dữ liệu đã xác nhận vào hồ sơ.'); }} /> : null}
      <p className="document-notice">Đối chiếu họ tên, ngày khám, đơn vị và liều với bản gốc. Đây là bản chép, không phải chẩn đoán hay đơn thuốc mới.</p>
      <div className="document-review-tools">
        <p>{draft.pages.reduce((count, page) => count + pageRows(page).length, 0)} mục · {draft.pages.reduce((count, page) => count + pageRows(page).filter(row => row.unclear).length, 0)} cần kiểm tra lại</p>
        <button type="button" aria-pressed={onlyUnclear} onClick={() => setOnlyUnclear(value => !value)}>{onlyUnclear ? 'Xem tất cả các mục' : 'Chỉ xem mục cần kiểm tra'}</button>
      </div>
      {draft.pages.length > 1 ? <nav className="document-page-picker" aria-label="Chọn trang tài liệu">
        {draft.pages.map((page, index) => <button key={page.page} type="button" aria-current={selectedPage === index ? 'page' : undefined} onClick={() => setSelectedPage(index)}>
          Trang {page.page}<small>{DOCUMENT_TYPES[page.kind]} · {pageRows(page).filter(row => row.unclear).length} cần xem</small>
        </button>)}
      </nav> : null}
      {draft.pages.map((page, pageIndex) => <fieldset className="document-page" key={page.page} disabled={busy} hidden={selectedPage !== pageIndex}>
        <legend>Trang {page.page}</legend>
        <label>Loại giấy tờ<select value={page.kind} onChange={e => changePage(pageIndex, p => ({ ...p, kind: e.target.value }))}>
          {Object.entries(DOCUMENT_TYPES).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label>
        <label>Tiêu đề<input value={page.title} maxLength={160} onChange={e => changePage(pageIndex, p => ({ ...p, title: e.target.value }))} /></label>
        {page.warnings.length ? <ul className="document-warnings">{page.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
        {onlyUnclear && !pageRows(page).some(row => row.unclear) ? <p className="document-filter-empty" role="status">Trang này không có mục đang đánh dấu cần kiểm tra. Vẫn nên đối chiếu với bản gốc.</p> : null}
        {(Object.keys(GROUPS) as Group[]).map(group => <section key={group} className="document-group" aria-label={GROUPS[group]}>
          <h2>{GROUPS[group]} <span>{page[group].length}</span></h2>
          {page[group].map((row, rowIndex) => <details key={rowIndex} hidden={onlyUnclear && !row.unclear} className={row.unclear ? 'document-row needs-review' : 'document-row'}>
            <summary><span><strong>{'name' in row ? row.name || 'Thuốc chưa ghi tên' : row.label || 'Mục mới'}</strong>
              <small>{'value' in row ? withPrintedUnit(row.value, row.unit) : 'amount' in row ? withPrintedUnit(row.amount, row.currency) : [row.dose, row.frequency].filter(Boolean).join(' · ')}</small></span>
              <span>{row.unclear ? 'Chưa rõ' : 'Sửa'}</span></summary>
            <div className="document-row-form">
              {Object.entries(row).filter(([key]) => key !== 'evidence' && key !== 'unclear').map(([key, value]) => <label key={key}>{FIELD_LABELS[key] ?? key}
                {['value', 'ingredients', 'instructions'].includes(key)
                  ? <textarea rows={2} value={String(value)} maxLength={MAX[key]} onChange={e => changeRow(pageIndex, group, rowIndex, key, e.target.value)} />
                  : <input value={String(value)} maxLength={group === 'charges' && key === 'label' ? 160 : MAX[key]} onChange={e => changeRow(pageIndex, group, rowIndex, key, e.target.value)} />}
              </label>)}
              <blockquote><small>Chữ được đọc từ bản gốc</small>{row.evidence || 'Không đọc rõ; cần tự đối chiếu.'}</blockquote>
              <label className="document-check"><input type="checkbox" checked={row.unclear} onChange={e => changeRow(pageIndex, group, rowIndex, 'unclear', e.target.checked)} />Mục này vẫn cần kiểm tra lại</label>
              <button type="button" onClick={() => changePage(pageIndex, p => ({ ...p, [group]: p[group].filter((_, i) => i !== rowIndex) }))}>Bỏ dòng này</button>
            </div>
          </details>)}
          {page[group].length < EMPTY_LIMITS[group] ? <button className="document-add" type="button" onClick={() => changePage(pageIndex, p => ({ ...p, [group]: [...p[group], emptyRow(group)] }))}>
            + {group === 'fields' ? 'Thêm thông tin còn thiếu' : group === 'medicines' ? 'Thêm thuốc còn thiếu' : 'Thêm khoản thu'}
          </button> : null}
        </section>)}
      </fieldset>)}
      <div className="document-save">
        <p role="status">{dirty ? 'Có thay đổi chưa lưu.' : scan?.status === 'confirmed' ? 'Bản đối chiếu đã lưu. Có thể mở từng mục để sửa tiếp.' : 'Bản đọc tự động chưa được xác nhận.'}</p>
        <label className="document-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Tôi đã đối chiếu các trang với bản gốc</label>
        <button type="submit" disabled={!confirmed || busy || conflict}>{busy ? 'Đang lưu…' : 'Lưu bản đối chiếu'}</button>
        <button type="button" disabled={busy} onClick={() => void copy()}>Chép nội dung</button>
        <p>Nút này chỉ lưu bản đọc. Dùng “Xác nhận & thêm vào hồ sơ” phía trên để đưa dữ liệu đã đối chiếu vào hồ sơ khám.</p>
      </div>
    </form> : null}
    {message ? <p role="status" className="document-message">{message}</p> : null}
  </section>;
}
