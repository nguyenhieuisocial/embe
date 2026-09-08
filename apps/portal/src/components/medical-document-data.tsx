'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DOCUMENT_DATA_GROUPS, groupDocumentData, type ImportedDocumentData } from '../lib/medical-document-data';
import { validDocumentAnalysis } from '../lib/medical-document-scan';
import type { MedicalDocument } from '../lib/pregnancy-medical';
import MedicalDocumentButton from './medical-document-viewer';
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
    void fetch(`/api/pregnancy/documents/${document.id}/import?view=imported`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Chưa tải được dữ liệu. Thử lại hoặc mở bản đọc.');
        const value = await response.json();
        if (value.documentId !== document.id || value.recordId !== recordId || !validDocumentAnalysis(value.analysis)) throw new Error('Chưa xác minh được dữ liệu của hồ sơ này.');
        if (!controller.signal.aborted) { setData(value); setError(''); }
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [open, data, retry, document.id, recordId]);
  const groups = useMemo(() => data ? groupDocumentData(data.analysis) : null, [data]);
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
  const search = fold(query.trim());
  const visible = groups ? Object.entries(groups).map(([key, rows]) => [key, rows.filter(row => !search || fold([row.label, row.value, ...row.details, row.evidence].join(' ')).includes(search))] as const).filter(([, rows]) => rows.length) : [];
  return <section className="medical-data" aria-label={`Thông tin từ ${document.originalFilename}`}>
    <button className="medical-data-toggle" type="button" aria-expanded={open} aria-controls={`medical-data-${document.id}`} onClick={() => setOpen(v => !v)}>
      {open ? 'Thu gọn thông tin đã phân loại' : 'Xem thông tin đã phân loại'}
    </button>
    {open ? <div id={`medical-data-${document.id}`}>
      {!data ? error ? <p role="alert">{error}<button type="button" onClick={() => { setError(''); setRetry(n => n + 1); }}>Thử lại</button></p> : <p role="status">Đang tải thông tin tài liệu…</p> : <>
        <p>Bản lưu lúc thêm vào hồ sơ. Không phải kết luận mới; mục chưa rõ vẫn cần đối chiếu. Sửa bản đọc về sau không tự đổi bản lưu này.</p>
        <label className="medical-data-search">Tìm trong tài liệu<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Chỉ số, thuốc, lời dặn…" /></label>
        {visible.map(([key, rows]) => <details key={key} open={search ? true : undefined}>
          <summary>{DOCUMENT_DATA_GROUPS[key as keyof typeof DOCUMENT_DATA_GROUPS]} <span>{rows.length}</span></summary>
          {key === 'charges' ? <p>Nguyên văn trên phiếu; chưa cộng thành chi tiêu để tránh tính trùng tổng tiền và khoản chi tiết.</p> : null}
          {rows.map(row => <div className="medical-data-row" key={`${row.page}:${row.sourceGroup}:${row.index}`}>
            <div><b>{row.label || 'Mục chưa có tên'}</b><p>{row.value || 'Chưa đọc rõ'}</p>
              {row.details.map((text, i) => <small key={i}>{text}</small>)}
              {row.unclear ? <small className="medical-data-warning">Cần đối chiếu bản gốc</small> : null}
              {row.evidence ? <details className="medical-data-evidence"><summary>Chữ đối chiếu</summary><blockquote>{row.evidence}</blockquote></details> : null}
            </div>
            <MedicalDocumentButton document={document} pageNumber={row.page}>Trang {row.page}</MedicalDocumentButton>
          </div>)}
        </details>)}
        {!visible.length ? <p>Không có mục phù hợp{search ? ' với từ khóa này' : ' trong bản đã lưu'}. Toàn bộ chữ gốc vẫn có trong bản đọc.</p> : null}
      </>}
      <Link href={`/me-bau/ho-so/tai-lieu/${document.id}`} prefetch={false}>Mở bản đọc đầy đủ & đối chiếu</Link>
    </div> : null}
  </section>;
}
