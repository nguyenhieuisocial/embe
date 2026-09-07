"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const lock = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Không tìm thấy tài liệu, hoặc hồ sơ đã được xóa.' : 'Chưa tải được tài liệu. Kiểm tra kết nối rồi thử lại.');
    const value: DocumentScan = await response.json();
    if (value.analysis && !validDocumentAnalysis(value.analysis)) throw new Error('Bản đọc chưa đúng cấu trúc. Bản gốc vẫn còn nguyên.');
    setScan(value); setDraft(value.analysis); setDirty(false); setConfirmed(false); setConflict(false);
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
    if (!confirmed || !draft || !scan || lock.current) return;
    if (!validDocumentAnalysis(draft)) { setError('Bản nhập quá dài hoặc có trường không hợp lệ. Rút gọn nội dung rồi lưu lại.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: scan.revision, analysis: draft, confirmed: true }) });
      if (response.status === 409) { setConflict(true); throw new Error('Tài liệu đã được cập nhật trên thiết bị khác. Bản đang sửa vẫn còn ở đây; xem bản mới trước khi lưu.'); }
      if (!response.ok) throw new Error('Chưa lưu được. Nội dung đang sửa vẫn còn; hãy thử lại khi có mạng.');
      const saved: DocumentScan = await response.json();
      setScan(saved); setDraft(saved.analysis); setDirty(false); setConfirmed(false);
      setMessage('Đã lưu bản đối chiếu vào tài liệu này.');
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function copy() {
    if (!draft) return;
    try { await navigator.clipboard.writeText(documentAnalysisText(draft)); setMessage('Đã chép nội dung. Chỉ chia sẻ cho người anh/chị cho phép xem hồ sơ.'); }
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
      <a className="document-original" href={`/api/pregnancy/documents/${documentId}`} target="_blank" rel="noreferrer">Mở bản gốc · {scan.filename}</a>
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
      <p className="document-notice">Đối chiếu họ tên, ngày khám, đơn vị và liều với bản gốc. Đây là bản chép, không phải chẩn đoán hay đơn thuốc mới.</p>
      {draft.pages.map((page, pageIndex) => <fieldset className="document-page" key={page.page} disabled={busy}>
        <legend>Trang {page.page}</legend>
        <label>Loại giấy tờ<select value={page.kind} onChange={e => changePage(pageIndex, p => ({ ...p, kind: e.target.value }))}>
          {Object.entries(DOCUMENT_TYPES).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label>
        <label>Tiêu đề<input value={page.title} maxLength={160} onChange={e => changePage(pageIndex, p => ({ ...p, title: e.target.value }))} /></label>
        {page.warnings.length ? <ul className="document-warnings">{page.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
        {(Object.keys(GROUPS) as Group[]).map(group => <section key={group} className="document-group" aria-label={GROUPS[group]}>
          <h2>{GROUPS[group]} <span>{page[group].length}</span></h2>
          {page[group].map((row, rowIndex) => <details key={rowIndex} className={row.unclear ? 'document-row needs-review' : 'document-row'}>
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
        <label className="document-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Tôi đã đối chiếu các trang với bản gốc</label>
        <button type="submit" disabled={!confirmed || busy || conflict}>{busy ? 'Đang lưu…' : 'Lưu bản đối chiếu'}</button>
        <button type="button" disabled={busy} onClick={() => void copy()}>Chép nội dung</button>
        <p>Chỉ lưu vào tài liệu này. Không tự đổi hồ sơ sức khỏe, liều thuốc, lịch hẹn hoặc tạo chi phí.</p>
      </div>
    </form> : null}
    {message ? <p role="status" className="document-message">{message}</p> : null}
  </section>;
}
