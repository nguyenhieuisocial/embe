'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { uploadDocument } from '../lib/medical-upload-client';
import { clearPrivateGetCache } from '../lib/private-get-cache';
import './medical-document-intake.css';

type Entry = { id: string; documentId: string; file: File; status: 'waiting' | 'uploading' | 'saved' | 'failed' };
export default function MedicalDocumentIntake({ onSaved }: { onSaved: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const camera = useRef<HTMLInputElement>(null); const picker = useRef<HTMLInputElement>(null);
  const busy = entries.some(e => e.status === 'uploading' || e.status === 'waiting');
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  async function run(batch: Entry[]) {
    if (lock.current) return;
    lock.current = true;
    for (const entry of batch) {
      const mark = (status: Entry['status']) => setEntries(current => current.map(e => e.id === entry.id ? { ...e, status } : e));
      mark('uploading');
      try {
        const created = await fetch('/api/pregnancy/intake', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: entry.id, title: `Chờ đọc · ${entry.file.name || 'Ảnh chụp'}`.slice(0, 100) }), signal: AbortSignal.timeout(20000) });
        if (!created.ok) throw new Error('intake_failed');
        await uploadDocument(entry.id, entry.file, entry.documentId);
        mark('saved'); clearPrivateGetCache('/api/pregnancy/records'); onSaved();
      } catch { mark('failed'); }
    }
    lock.current = false;
  }
  function select(files: FileList | null) {
    if (!files?.length || lock.current) return;
    if (files.length > 6) { setNotice('Chọn tối đa 6 file mỗi lượt; chưa tải file nào.'); return; }
    if (Array.from(files).some(file => !file.size || file.type === 'application/pdf' && file.size > 15_000_000 || !file.type.startsWith('image/') && file.type !== 'application/pdf')) {
      setNotice('Chọn ảnh hoặc PDF; PDF tối đa 15 MB và 6 trang.'); return;
    }
    setNotice('');
    const batch: Entry[] = Array.from(files).map(file => ({ id: crypto.randomUUID(), documentId: crypto.randomUUID(), file, status: 'waiting' }));
    setEntries(current => [...current, ...batch]); void run(batch);
  }
  return <section className="medical-intake" id="them-giay-to" aria-label="Chụp và tải giấy tờ khám thai">
    <h3>Thêm giấy tờ khám</h3>
    <p>Tự đọc phiếu thu, đơn thuốc, siêu âm, xét nghiệm và bệnh án.</p>
    <div className="medical-intake-actions">
      <button type="button" disabled={busy} onClick={() => camera.current?.click()}>Chụp giấy tờ</button>
      <button type="button" disabled={busy} onClick={() => picker.current?.click()}>Chọn ảnh / PDF</button>
    </div>
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label="Chụp giấy tờ khám" onChange={e => { select(e.target.files); e.target.value = ''; }} />
    <input ref={picker} hidden type="file" accept="image/*,application/pdf" multiple aria-label="Chọn giấy tờ khám" onChange={e => { select(e.target.files); e.target.value = ''; }} />
    <small>Chụp rõ bốn góc. Tối đa 6 file/lượt, 15 MB/file; PDF tối đa 6 trang. Xác nhận bản đọc trước khi thêm chỉ số và thuốc.</small>
    {notice ? <p role="alert">{notice}</p> : null}
    {entries.length ? <ul aria-live="polite">{entries.map((entry, i) => <li key={entry.id}>
      <span><b>{i + 1}. {entry.file.name || 'Ảnh chụp'}</b><small>{entry.status === 'saved' ? 'Đã lưu riêng tư · tự đọc trên máy tại nhà' : entry.status === 'failed' ? 'Tải chưa xong · giữ trang này để thử lại' : entry.status === 'uploading' ? 'Đang tải và lưu bản gốc…' : 'Chờ tải…'}</small></span>
      {entry.status === 'saved' ? <Link href={`/me-bau/ho-so/tai-lieu/${entry.documentId}`} prefetch={false}>Xem bản đọc</Link> : entry.status === 'failed' ? <button type="button" disabled={busy} onClick={() => void run([entry])}>Thử lại</button> : null}
    </li>)}</ul> : null}
  </section>;
}
