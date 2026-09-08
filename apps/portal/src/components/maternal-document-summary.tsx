"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFamilyDataRefresh } from '../lib/use-family-data-refresh';
import { validDocumentAnalysis, type DocumentScan } from '../lib/medical-document-scan';
import { DOCUMENT_DATA_GROUPS, groupDocumentData } from '../lib/medical-document-data';
import { medicalDocumentName } from '../lib/medical-document-name';
import { refreshFamilyData } from '../lib/family-data-refresh';

type Summary = { scans: DocumentScan[]; total: number; pending: number; failed: number };
export default function MaternalDocumentSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncNote, setSyncNote] = useState('');
  useEffect(() => {
    let active = true;
    void fetch('/api/family/members/sync-maternal', { method: 'POST' }).then(async response => {
      if (!response.ok) throw new Error('sync');
      const result = await response.json();
      if (!active) return;
      setSyncNote(result.added.length ? `Đã bổ sung ${result.added.length} mục từ giấy tờ vào hồ sơ Mẹ.`
        : result.conflicts.length ? 'Có giá trị khác nhau giữa hồ sơ và giấy tờ; đã giữ nguyên thông tin đang lưu.'
        : 'Đã kiểm tra khớp dữ liệu. Chỉ tự thêm mục trống từ bản đọc đã đối chiếu và đúng họ tên Mẹ.');
      if (result.added.length) refreshFamilyData();
    }).catch(() => { if (active) setSyncNote('Chưa tự khớp được dữ liệu; hồ sơ đang lưu vẫn được giữ. Lần mở sau sẽ thử lại.'); });
    return () => { active = false; };
  }, []);
  async function load(signal?: AbortSignal, canApply = () => true, background = false) {
    if (!background) setLoading(true);
    try {
      const response = await fetch('/api/pregnancy/records', { cache: 'no-store', signal });
      if (!response.ok) throw new Error('records');
      const result = await response.json();
      if (!Array.isArray(result.records)) throw new Error('records');
      const ids: string[] = [...new Set<string>(result.records.flatMap((record: {documents: {id: string}[]}) => record.documents.map(document => document.id)))];
      const summary: Summary = { scans: [], total: ids.length, pending: 0, failed: 0 };
      // Limit simultaneous requests; never download the original image for this view.
      for (let offset = 0; offset < ids.length; offset += 3) {
        if (signal?.aborted || !canApply()) return;
        await Promise.all(ids.slice(offset, offset + 3).map(async id => {
          try {
            const read = await fetch(`/api/pregnancy/documents/${id}/scan`, { cache: 'no-store', signal });
            if (!read.ok) throw new Error('scan');
            const scan: DocumentScan = await read.json();
            if (scan.documentId !== id) throw new Error('identity');
            if (['review', 'confirmed'].includes(scan.status) && validDocumentAnalysis(scan.analysis)) summary.scans.push(scan);
            else if (['idle', 'queued', 'processing'].includes(scan.status)) summary.pending++;
            else summary.failed++;
          } catch { summary.failed++; }
        }));
      }
      summary.scans.sort((a, b) => ids.indexOf(a.documentId) - ids.indexOf(b.documentId));
      if (!signal?.aborted && canApply()) { setData(summary); setError(false); }
    } catch { if (!signal?.aborted && canApply()) setError(true); }
    finally { if (!background && !signal?.aborted && canApply()) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, []);
  useFamilyDataRefresh(canApply => load(undefined, canApply, true), !loading);
  return <section aria-label="Dữ liệu từ giấy tờ của Mẹ">
    <h2>Dữ liệu từ giấy tờ</h2>
    {syncNote ? <p role="status" className="state-note">{syncNote}</p> : null}
    <p className="state-note">Tự tổng hợp bản đọc đã lưu, không cần nhập lại. Đây là nội dung trên giấy, không phải kết luận sức khỏe hay đơn thuốc đang dùng.</p>
    {loading ? <p role="status">Đang cập nhật dữ liệu giấy tờ…</p> : null}
    {error ? <p role="alert">Chưa cập nhật được giấy tờ. <button type="button" className="btn btn-quiet" disabled={loading} onClick={() => void load()}>Thử lại</button></p> : null}
    {data ? <>
      <p className="state-note">{data.scans.length}/{data.total} tài liệu có bản đọc{data.pending ? ` · ${data.pending} chưa đọc xong` : ''}{data.failed ? ` · ${data.failed} chưa tải được bản đọc` : ''}.</p>
      {!data.total ? <Link className="btn btn-quiet" href="/me-bau/ho-so">Chụp hoặc thêm giấy tờ</Link> : null}
      {Object.entries(DOCUMENT_DATA_GROUPS).map(([key, label]) => {
        const documents = data.scans.flatMap(scan => {
          if (!scan.analysis) return [];
          const rows = groupDocumentData(scan.analysis)[key as keyof typeof DOCUMENT_DATA_GROUPS];
          return rows.length ? [{ scan, rows }] : [];
        });
        return <details className="member-group" key={key}>
          <summary>{label}<small>{documents.reduce((count, document) => count + document.rows.length, 0)} mục</small></summary>
          {!documents.length ? <p>Chưa có dữ liệu trong các bản đọc hiện tải được.</p> : documents.map(({scan, rows}) => <article key={scan.documentId}>
            <Link className="btn btn-quiet" href={`/me-bau/ho-so/tai-lieu/${scan.documentId}`}>{medicalDocumentName([scan.analysis!])}</Link>
            <p className="state-note">{scan.status === 'confirmed' ? 'Bản đọc đã đối chiếu' : 'Bản đọc tự động — chưa đối chiếu toàn bộ'}</p>
            <dl>{rows.map(row => <div key={`${row.page}-${row.sourceGroup}-${row.index}`} style={{overflowWrap: 'anywhere', marginBottom: 12}}>
              <dt><strong>{row.label}</strong> · trang {row.page}</dt>
              <dd style={{marginInlineStart: 0}}>{row.value || 'Chưa ghi giá trị'}{row.unclear ? ' · Chữ / số chưa rõ' : ''}
                {row.details.map((detail, index) => <p key={index}>{detail}</p>)}
              </dd>
            </div>)}</dl>
          </article>)}
        </details>;
      })}
    </> : null}
  </section>;
}
