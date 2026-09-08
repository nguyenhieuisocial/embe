'use client';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DOCUMENT_DATA_GROUPS, groupDocumentData, type ImportedDocumentData } from '../lib/medical-document-data';
import { validDocumentAnalysis } from '../lib/medical-document-scan';
import type { MedicalDocument } from '../lib/pregnancy-medical';
import MedicalDocumentButton from './medical-document-viewer';
import MedicalDocumentSourceText from './medical-document-source-text';
import './medical-document-data.css';

/** Fetch only when opened. Never place medical source text in persistent browser caches. */
export default function MedicalDocumentData({ document, recordId }: { document: MedicalDocument; recordId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ImportedDocumentData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open || data) return;
    const controller = new AbortController();
    const automatic = !document.imported && (document.scanStatus === 'review' || document.scanStatus === 'confirmed');
    void fetch(`/api/pregnancy/documents/${document.id}/${automatic ? 'scan' : 'import?view=imported'}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Chưa tải được dữ liệu. Thử lại hoặc mở bản đọc.');
        const value = await response.json();
        if (value.documentId !== document.id || value.recordId !== recordId || !validDocumentAnalysis(value.analysis)) throw new Error('Chưa xác minh được dữ liệu của hồ sơ này.');
        if (automatic && !['review', 'confirmed'].includes(value.status)) throw new Error('Tài liệu đang được đọc lại. Mở bản đọc để xem tiến độ.');
        if (!controller.signal.aborted) { setData({ ...value, automaticallyExtracted: automatic }); setError(''); }
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [open, data, retry, document.id, document.imported, document.scanStatus, recordId]);
  const groups = useMemo(() => data ? groupDocumentData(data.analysis) : null, [data]);
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
  const search = useDeferredValue(fold(query.trim()));
  const visible = groups ? Object.entries(groups).map(([key, rows]) => [key, rows.filter(row => !search || fold([row.label, row.value, ...row.details, row.evidence].join(' ')).includes(search))] as const).filter(([, rows]) => rows.length) : [];
  const sourceMatches = data && search ? data.analysis.pages.flatMap(page => (['pdf', 'ocr'] as const).flatMap(kind => {
    const text = kind === 'pdf' ? page.pdfText : page.ocrText;
    return (text?.split(/\r?\n/) ?? []).filter(line => fold(line).includes(search)).map((line, index) => ({ page: page.page, kind, line, index }));
  })) : [];
  return <section className="medical-data" aria-label={`Thông tin từ ${document.originalFilename}`}>
    <button className="medical-data-toggle" type="button" aria-expanded={open} aria-controls={`medical-data-${document.id}`} onClick={() => setOpen(v => !v)}>
      {open ? 'Thu gọn thông tin đã phân loại' : 'Xem thông tin đã phân loại'}
    </button>
    {open ? <div id={`medical-data-${document.id}`}>
      {!data ? error ? <p role="alert">{error}<button type="button" onClick={() => { setError(''); setRetry(n => n + 1); }}>Thử lại</button></p> : <p role="status">Đang tải thông tin tài liệu…</p> : <>
        <p>{data.automaticallyExtracted ? 'Bản đọc tự động · chưa xác minh chuyên môn.' : 'Bản dữ liệu lúc nhập hồ sơ · không tự đổi khi sửa bản đọc.'}</p>
        {data.analysis.pages.some(page => page.warnings.length) ? <details className="medical-data-warning">
          <summary>Phần bộ đọc chưa chắc chắn</summary>
          {data.analysis.pages.flatMap(page => page.warnings.map((warning, i) => <p key={`${page.page}:${i}`}>Trang {page.page}: {warning}</p>))}
        </details> : null}
        <label className="medical-data-search">Tìm trong tài liệu<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Chỉ số, thuốc, lời dặn…" /></label>
        {visible.map(([key, rows]) => <details key={key} open={search ? true : undefined}>
          <summary>{DOCUMENT_DATA_GROUPS[key as keyof typeof DOCUMENT_DATA_GROUPS]} <span>{rows.length}</span></summary>
          {key === 'charges' ? <p>Khoản thu trên phiếu · chưa cộng vào chi tiêu.</p> : null}
          {rows.map(row => <div className="medical-data-row" key={`${row.page}:${row.sourceGroup}:${row.index}`}>
            <div><b>{row.label || 'Mục chưa có tên'}</b><p>{row.value || 'Chưa đọc rõ'}</p>
              {row.details.map((text, i) => <small key={i}>{text}</small>)}
              {row.duplicateCount ? <small>{row.duplicateCount} dòng trùng đã gộp</small> : null}
              {row.unclear ? <small className="medical-data-warning">Cần đối chiếu bản gốc</small> : null}
              {row.evidence ? <details className="medical-data-evidence"><summary>Chữ đối chiếu</summary><blockquote>{row.evidence}</blockquote></details> : null}
            </div>
            <MedicalDocumentButton document={document} pageNumber={row.page}>Trang {row.page}</MedicalDocumentButton>
          </div>)}
        </details>)}
        {sourceMatches.length ? <details open><summary>Khớp trong toàn văn <span>{sourceMatches.length}</span></summary>
          {sourceMatches.map(match => <div className="medical-data-row" key={`${match.page}:${match.kind}:${match.index}`}>
            <div><small>{match.kind === 'pdf' ? 'Chữ PDF' : 'OCR từ ảnh'} · Trang {match.page}</small><p>{match.line}</p></div>
            <MedicalDocumentButton document={document} pageNumber={match.page}>Trang {match.page}</MedicalDocumentButton>
          </div>)}
        </details> : null}
        {!visible.length && !sourceMatches.length ? <p>Không có mục phù hợp{search ? ' với từ khóa này' : ' trong bản đã lưu'}. Kiểm tra toàn văn và bản gốc bên dưới.</p> : null}
        <details className="medical-data-fulltext"><summary>Toàn văn từng trang · kể cả phần chưa phân loại</summary>
          <p>{data.automaticallyExtracted ? 'Chữ tự đọc từ tài liệu; có thể có sai sót.' : data.sourceSnapshot ? 'Chữ lưu cùng lần nhập hồ sơ.' : 'Chữ hiện có; có thể mới hơn bản đã nhập.'}</p>
          {data.analysis.pages.map(page => <div key={page.page}>
            {page.pdfText ? <MedicalDocumentSourceText text={page.pdfText} page={page.page} kind="pdf" /> : null}
            {page.ocrText ? <MedicalDocumentSourceText text={page.ocrText} page={page.page} kind="ocr" /> : null}
            {!page.pdfText && !page.ocrText ? <p>Trang {page.page}: chưa có lớp chữ độc lập. Không coi là đã trích xuất hết; mở bản gốc hoặc đọc lại tài liệu.</p> : null}
            <MedicalDocumentButton document={document} pageNumber={page.page}>Bản gốc · Trang {page.page}</MedicalDocumentButton>
          </div>)}
        </details>
      </>}
      <Link href={`/me-bau/ho-so/tai-lieu/${document.id}`} prefetch={false}>Mở bản đọc đầy đủ & đối chiếu</Link>
    </div> : null}
  </section>;
}
