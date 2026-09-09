'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { uploadDocument } from '../lib/medical-upload-client';
import { notifyFamilyDataChanged } from '../lib/family-data-refresh';
import './medical-document-intake.css';

type Entry = { id: string; documentId: string; file: File; status: 'waiting' | 'uploading' | 'saved' | 'failed' };
export default function MedicalDocumentIntake({ onSaved, id='them-giay-to' }: { onSaved: () => void; id?:string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState('');
  const [lastSavedName, setLastSavedName] = useState('');
  const lock = useRef(false);
  const queue = useRef<Entry[]>([]);
  const camera = useRef<HTMLInputElement>(null); const picker = useRef<HTMLInputElement>(null);
  const busy = entries.some(e => e.status === 'uploading' || e.status === 'waiting');
  const saved = entries.filter(e => e.status === 'saved');
  const failed = entries.filter(e => e.status === 'failed').length;
  const remaining = entries.length - saved.length - failed;
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  async function run(batch: Entry[]) {
    queue.current.push(...batch);
    if (lock.current) return;
    lock.current = true;
    while (queue.current.length) {
      const entry = queue.current.shift()!;
      const mark = (status: Entry['status']) => setEntries(current => current.map(e => e.id === entry.id ? { ...e, status } : e));
      mark('uploading');
      try {
        const created = await fetch('/api/pregnancy/intake', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: entry.id, title: `Chờ đọc · ${entry.file.name || 'Ảnh chụp'}`.slice(0, 100) }), signal: AbortSignal.timeout(20000) });
        if (!created.ok) throw new Error('intake_failed');
        await uploadDocument(entry.id, entry.file, entry.documentId);
        mark('saved'); setLastSavedName(entry.file.name || 'Ảnh chụp'); notifyFamilyDataChanged(); onSaved();
      } catch { mark('failed'); }
    }
    lock.current = false;
  }
  function select(files: FileList | null) {
    if (!files?.length) return;
    if (files.length > 6) { setNotice('Chọn tối đa 6 file mỗi lượt; chưa tải file nào.'); return; }
    if (files.length + queue.current.length + (lock.current ? 1 : 0) > 6) {
      setNotice('Đang có nhiều giấy tờ chờ tải. Đợi bớt file hoàn tất rồi chụp hoặc chọn thêm; lượt chọn này chưa được thêm.'); return;
    }
    if (Array.from(files).some(file => !file.size || file.type === 'application/pdf' && file.size > 15_000_000 || !file.type.startsWith('image/') && file.type !== 'application/pdf')) {
      setNotice('Chọn ảnh hoặc PDF; PDF tối đa 15 MB và 6 trang.'); return;
    }
    setNotice('');
    const batch: Entry[] = Array.from(files).map(file => ({ id: crypto.randomUUID(), documentId: crypto.randomUUID(), file, status: 'waiting' }));
    setEntries(current => [...current, ...batch]); void run(batch);
  }
  return <section className="medical-intake" id={id} aria-label="Chụp và tải giấy tờ khám thai">
    <h3>Thêm giấy tờ khám</h3>
    <p>Tự đọc phiếu thu, đơn thuốc, siêu âm, xét nghiệm và bệnh án.</p>
    <div className="medical-intake-actions">
      <button type="button" onClick={() => camera.current?.click()}>{entries.length ? 'Chụp thêm trang' : 'Chụp giấy tờ'}</button>
      <button type="button" onClick={() => picker.current?.click()}>Chọn ảnh / PDF</button>
    </div>
    {entries.length ? <div className="medical-intake-result" role="status" aria-live="polite" aria-atomic="true">
      <strong>{saved.length ? `Đã thêm thành công ${saved.length}/${entries.length} giấy tờ` : 'Chưa có giấy tờ nào lưu thành công'}</strong>
      {saved.length ? <span>Vừa lưu: {lastSavedName}. Bản gốc đã được lưu; dữ liệu nhận diện sẽ cập nhật sau.</span> : null}
      {remaining ? <span>Còn {remaining} file đang tải/chờ. Giữ trang mở đến khi xong.</span> : null}
      {failed ? <span>{failed} file chưa lưu — bấm Thử lại ở từng file bên dưới.</span> : null}
    </div> : null}
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label="Chụp giấy tờ khám" onChange={e => { select(e.target.files); e.target.value = ''; }} />
    <input ref={picker} hidden type="file" accept="image/*,application/pdf" multiple aria-label="Chọn giấy tờ khám" onChange={e => { select(e.target.files); e.target.value = ''; }} />
    <details className="medical-intake-help"><summary>Cách chụp & giới hạn file</summary><small>Chọn nhiều ảnh/PDF cùng lúc, hoặc chụp từng trang rồi bấm Chụp thêm trang; có thể thêm khi file trước đang tải. Tối đa 6 file đang tải/chờ, 15 MB/file; PDF tối đa 6 trang. Mỗi file được lưu riêng, không tự ghép thành một PDF.</small></details>
    {notice ? <p role="alert">{notice}</p> : null}
    {entries.length ? <ul aria-live="polite">{entries.map((entry, i) => <li key={entry.id}>
      <span><b>{i + 1}. {entry.file.name || 'Ảnh chụp'}</b><small>{entry.status === 'saved' ? 'Đã thêm thành công · bản gốc đã lưu' : entry.status === 'failed' ? 'Tải chưa xong · giữ trang này để thử lại' : entry.status === 'uploading' ? 'Đang tải và lưu bản gốc…' : 'Chờ tải…'}</small></span>
      {entry.status === 'saved' ? <Link href={`/me-bau/ho-so/tai-lieu/${entry.documentId}`} prefetch={false}>Xem bản đọc</Link> : entry.status === 'failed' ? <button type="button" disabled={busy} onClick={() => void run([entry])}>Thử lại</button> : null}
    </li>)}</ul> : null}
  </section>;
}
