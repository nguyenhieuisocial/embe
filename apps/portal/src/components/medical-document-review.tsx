"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MedicalDocumentImport from './medical-document-import';
import MedicalDocumentSourceText from './medical-document-source-text';
import MedicalDocumentButton from './medical-document-viewer';
import { medicalDocumentName } from '../lib/medical-document-name';
import MedicalDocumentOverview, { documentSourceKey } from './medical-document-overview';
import { buildDocumentOverview, type DocumentOverviewRef } from '../lib/medical-document-overview';
import { DOCUMENT_TYPES, DOCUMENT_ROW_LIMITS, DOCUMENT_DETAIL_DEFAULTS, SCAN_ERROR_TEXT, documentAnalysisText, editableDocumentAnalysis, validDocumentAnalysis, withPrintedUnit,
  type DocumentAnalysis, type DocumentPage, type DocumentScan, type ExtractedField, type ExtractedMedicine, type ExtractedCharge } from '../lib/medical-document-scan';

const FIELD_LABELS: Record<string, string> = { label: 'Tên mục / chỉ số', value: 'Nội dung / kết quả', unit: 'Đơn vị trên phiếu', reference: 'Khoảng tham chiếu trên phiếu',
  name: 'Tên thuốc', ingredients: 'Thành phần / hàm lượng', dose: 'Liều ghi trên đơn', frequency: 'Số lần dùng', instructions: 'Cách dùng ghi trên đơn',
  amount: 'Thành tiền nguyên văn', currency: 'Tiền tệ trên phiếu', context: 'Ngữ cảnh / thời điểm trên phiếu', route: 'Đường dùng ghi trên đơn', duration: 'Thời gian dùng ghi trên đơn', quantity: 'Số lượng trên phiếu', unitPrice: 'Đơn giá nguyên văn' };
const MAX: Record<string, number> = { label: 120, value: 1600, unit: 40, reference: 160, name: 100, ingredients: 1200, dose: 80, frequency: 80, instructions: 200, amount: 80, currency: 20, context: 160, route: 80, duration: 80, quantity: 80, unitPrice: 80 };
type Group = 'fields' | 'medicines' | 'charges';
type Row = ExtractedField | ExtractedMedicine | ExtractedCharge;
const emptyRow = (group: Group): Row => group === 'fields' ? { label: '', value: '', unit: '', reference: '', evidence: '', unclear: true }
  : group === 'medicines' ? { name: '', ingredients: '', dose: '', frequency: '', instructions: '', evidence: '', unclear: true }
    : { label: '', amount: '', currency: '', evidence: '', unclear: true };
const GROUPS: Record<Group, string> = { fields: 'Thông tin và chỉ số', medicines: 'Thuốc trên tài liệu', charges: 'Khoản thu và thanh toán' };

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
      {failed ? <p role="status">Chưa tải được ảnh. Dùng nút xem toàn màn hình bên dưới để thử lại.</p> : <div className="document-image-scroll" tabIndex={0} role="region" aria-label="Ảnh tài liệu gốc, có thể cuộn">
        {/* Authenticated original: no public image optimizer or persisted browser copy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Bản gốc tài liệu để đối chiếu" style={{ width: `${zoom * 100}%` }} onError={() => setFailed(true)} />
      </div>}
    </div> : null}
    <MedicalDocumentButton className="document-original" document={{ id: documentId, originalFilename: scan.filename, displayName: scan.analysis ? medicalDocumentName([scan.analysis]) : undefined, mimeType: scan.mimeType }} pageNumber={pageNumber}>Xem toàn màn hình · {scan.analysis ? medicalDocumentName([scan.analysis]) : scan.filename}</MedicalDocumentButton>
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
  const [sourceTarget, setSourceTarget] = useState<DocumentOverviewRef | null>(null);
  const overview = useMemo(() => draft ? buildDocumentOverview(draft) : null, [draft]);
  const reviewKeys = useMemo(() => new Set(overview?.reviewRefs.map(documentSourceKey)), [overview]);
  const needsReview = (page: number, group: Group, rowIndex: number) => reviewKeys.has(documentSourceKey({ page, group, rowIndex }));
  const pageReviewCount = (page: number) => overview?.reviewRefs.filter(ref => ref.page === page).length ?? 0;
  const lock = useRef(false);

  function selectSource(ref: DocumentOverviewRef) {
    const index = draft?.pages.findIndex(page => page.page === ref.page) ?? -1;
    if (index < 0) return;
    setOnlyUnclear(false); setSelectedPage(index); setSourceTarget(ref);
  }
  useEffect(() => {
    if (!sourceTarget) return;
    const row = document.getElementById(`document-${documentId}-${documentSourceKey(sourceTarget)}`) as HTMLDetailsElement | null;
    if (row) {
      row.open = true;
      row.scrollIntoView({ block: 'start', behavior: 'instant' });
      row.querySelector('summary')?.focus({ preventScroll: true });
    }
    setSourceTarget(null);
  }, [sourceTarget, documentId, selectedPage]);

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
        body: JSON.stringify({ revision: scan.revision, analysis: editableDocumentAnalysis(draft), confirmed: true }) });
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
      <p className="document-state" role="status">{scan.status === 'confirmed' ? 'Đã xác nhận' : scan.status === 'review' ? (draft?.pages.some(page => page.warnings.some(warning => warning.startsWith('Chưa phân loại đầy đủ:'))) ? 'Đã lấy chữ · chưa phân loại đầy đủ' : 'Đã đọc · cần đối chiếu') : scan.status === 'processing'
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
      {overview ? <MedicalDocumentOverview overview={overview} onSource={selectSource} /> : null}
      <p className="document-notice">Bản đọc đã được tự lưu cùng tài liệu. Các thông tin được phân nhóm trong hồ sơ, không cần xác nhận để lưu bản đọc. Thay đổi tự nhập trên trang này vẫn cần lưu.</p>
      {scan ? <details><summary>Đưa vào số đo, thuốc hoặc lịch hẹn chính thức</summary><MedicalDocumentImport documentId={documentId} recordId={scan.recordId} revision={scan.revision} analysis={draft} disabled={busy} onBusy={setBusy} onDirty={() => setDirty(true)}
        onImported={async () => { await load(); setMessage('Đã lưu bản đọc và thêm dữ liệu đã xác nhận vào hồ sơ.'); }} /></details> : null}
      <p className="document-notice">Đối chiếu họ tên, ngày khám, đơn vị và liều với bản gốc. Đây là bản chép, không phải chẩn đoán hay đơn thuốc mới.</p>
      <div className="document-review-tools">
        <p>{overview?.counts.items} mục · {overview?.counts.needsReview} mục gắn cờ đối chiếu</p>
        <button type="button" aria-pressed={onlyUnclear} onClick={() => setOnlyUnclear(value => !value)}>{onlyUnclear ? 'Xem tất cả các mục' : 'Chỉ xem mục cần kiểm tra'}</button>
      </div>
      {draft.pages.length > 1 ? <nav className="document-page-picker" aria-label="Chọn trang tài liệu">
        {draft.pages.map((page, index) => <button key={page.page} type="button" aria-current={selectedPage === index ? 'page' : undefined} onClick={() => setSelectedPage(index)}>
          Trang {page.page}<small>{DOCUMENT_TYPES[page.kind]} · {pageReviewCount(page.page)} cần xem</small>
        </button>)}
      </nav> : null}
      {draft.pages.map((page, pageIndex) => <fieldset className="document-page" key={page.page} disabled={busy} hidden={selectedPage !== pageIndex}>
        <legend>Trang {page.page}</legend>
        <label>Loại giấy tờ<select value={page.kind} onChange={e => changePage(pageIndex, p => ({ ...p, kind: e.target.value }))}>
          {Object.entries(DOCUMENT_TYPES).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label>
        <label>Tiêu đề<input value={page.title} maxLength={160} onChange={e => changePage(pageIndex, p => ({ ...p, title: e.target.value }))} /></label>
        {page.pdfText ? <MedicalDocumentSourceText text={page.pdfText} page={page.page} kind="pdf" /> : null}
        {page.ocrText ? <MedicalDocumentSourceText text={page.ocrText} page={page.page} kind="ocr" /> : null}
        {page.warnings.length ? <ul className="document-warnings">{page.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
        {onlyUnclear && !pageReviewCount(page.page) ? <p className="document-filter-empty" role="status">Trang này không có mục đang đánh dấu cần kiểm tra. Vẫn nên đối chiếu với bản gốc.</p> : null}
        {(Object.keys(GROUPS) as Group[]).map(group => <section key={group} className="document-group" aria-label={GROUPS[group]}>
          <h2>{GROUPS[group]} <span>{page[group].length}</span></h2>
          {page[group].map((row, rowIndex) => <details key={rowIndex} id={`document-${documentId}-${documentSourceKey({ page: page.page, group, rowIndex })}`}
            hidden={onlyUnclear && !needsReview(page.page, group, rowIndex)} className={needsReview(page.page, group, rowIndex) ? 'document-row needs-review' : 'document-row'}>
            <summary><span><strong>{'name' in row ? row.name || 'Thuốc chưa ghi tên' : row.label || 'Mục mới'}</strong>
              <small>{'value' in row ? [withPrintedUnit(row.value, row.unit), row.context].filter(Boolean).join(' · ') : 'amount' in row ? withPrintedUnit(row.amount, row.currency) : [row.dose, row.frequency].filter(Boolean).join(' · ')}</small></span>
              <span>{row.unclear ? 'Chưa rõ' : needsReview(page.page, group, rowIndex) ? 'Đối chiếu' : 'Sửa'}</span></summary>
            <div className="document-row-form">
              {Object.entries({ ...row, ...Object.fromEntries(Object.entries(DOCUMENT_DETAIL_DEFAULTS[group]).filter(([key]) => !(key in row))) }).filter(([key]) => !['evidence', 'unclear', 'pdfValue', 'pdfEvidence'].includes(key)).map(([key, value]) => <label key={key}>{key === 'quantity' && group === 'medicines' ? 'Số lượng cấp phát (không phải liều)' : FIELD_LABELS[key] ?? key}
                {['value', 'ingredients', 'instructions'].includes(key)
                  ? <textarea rows={2} value={String(value)} maxLength={MAX[key]} onChange={e => changeRow(pageIndex, group, rowIndex, key, e.target.value)} />
                  : <input value={String(value)} maxLength={group === 'charges' && key === 'label' ? 160 : MAX[key]} onChange={e => changeRow(pageIndex, group, rowIndex, key, e.target.value)} />}
              </label>)}
              <blockquote><small>Câu trích trong bản đọc · có thể đọc sai</small>{row.evidence || 'Không đọc rõ; cần tự đối chiếu.'}</blockquote>
              {'pdfValue' in row && row.pdfValue && row.pdfEvidence ? <div className="document-pdf-comparison">
                <blockquote><small>Chữ lấy trực tiếp từ PDF</small>{row.pdfEvidence}</blockquote>
                {row.value !== row.pdfValue && !row.unit && !row.reference && !row.context ? <>
                  <p>Khác nội dung đang nhập. Xem trang gốc rồi chọn bản đúng.</p>
                  <button type="button" onClick={() => changePage(pageIndex, p => ({ ...p, fields: p.fields.map((field, i) => i === rowIndex
                    ? { ...field, value: row.pdfValue!, unclear: true } : field) }))}>Dùng chữ từ PDF cho mục này</button>
                </> : null}
                <small>Lớp chữ của PDF cũng có thể sai hoặc thiếu; không thay thế hình trang gốc.</small>
              </div> : null}
              <label className="document-check"><input type="checkbox" checked={row.unclear} onChange={e => changeRow(pageIndex, group, rowIndex, 'unclear', e.target.checked)} />Mục này vẫn cần kiểm tra lại</label>
              <button type="button" onClick={() => changePage(pageIndex, p => ({ ...p, [group]: p[group].filter((_, i) => i !== rowIndex) }))}>Bỏ dòng này</button>
            </div>
          </details>)}
          {page[group].length < DOCUMENT_ROW_LIMITS[group] ? <button className="document-add" type="button" onClick={() => changePage(pageIndex, p => ({ ...p, [group]: [...p[group], emptyRow(group)] }))}>
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
