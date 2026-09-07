"use client";
import { useEffect, useRef, useState } from 'react';
import { uploadFamilyDocument } from '../lib/medical-upload-client';
import type { FamilyHealthDocument } from '../lib/family-health-documents';
import MedicalDocumentButton from './medical-document-viewer';

type Pending = { id: string; file: File; done: boolean; error: boolean };
export default function FamilyRecordDocuments({ memberId, recordId, readOnly, onBusy }: {
  memberId: string; recordId: string; readOnly: boolean; onBusy: (value: boolean) => void;
}) {
  const [documents, setDocuments] = useState<FamilyHealthDocument[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const photo = useRef<HTMLInputElement>(null); const files = useRef<HTMLInputElement>(null);
  const base = `/api/family/members/${memberId}/records/${recordId}/documents`;
  async function load(signal?: AbortSignal) {
    const response = await fetch(base, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Chưa đọc được giấy tờ. Kiểm tra đăng nhập và thử lại.');
    const data = await response.json() as { documents: FamilyHealthDocument[] };
    if (!Array.isArray(data.documents)) throw new Error('Chưa đọc được giấy tờ.');
    setDocuments(data.documents); setLoading(false);
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [base]);
  function working(value: boolean) { setBusy(value); onBusy(value); }
  async function upload(batch: Pending[]) {
    if (busy || readOnly) return;
    working(true); setError(''); setMessage('');
    let completed = 0;
    try {
      for (const item of batch) {
        setMessage(`Đang lưu giấy tờ ${++completed}/${batch.length}… Giữ EmBe mở đến khi xong.`);
        try {
          await uploadFamilyDocument(memberId, recordId, item.file, item.id);
          setPending(old => old.map(p => p.id === item.id ? { ...p, done: true, error: false } : p));
        } catch {
          setPending(old => old.map(p => p.id === item.id ? { ...p, error: true } : p));
          setError('Một số giấy tờ chưa tải xong. Bản ghi đã lưu; bấm Thử lại bên dưới, không cần nhập lại hồ sơ.');
        }
      }
      await load(); setMessage('Đã cập nhật danh sách giấy tờ.');
    } catch (e) { setError((e as Error).message); }
    finally { working(false); }
  }
  function select(selected: FileList | null) {
    if (!selected?.length || busy || readOnly) return;
    if (selected.length > 8 || documents.length + selected.length > 30) { setError('Chọn tối đa 8 file mỗi lần; mỗi bản ghi lưu tối đa 30 file kể cả mục đã gỡ.'); return; }
    const next = Array.from(selected).map(file => ({ id: crypto.randomUUID(), file, done: false, error: false }));
    setPending(old => [...old.filter(item => !item.done), ...next]); void upload(next);
  }
  async function change(item: FamilyHealthDocument, action: 'remove' | 'restore' | 'complete') {
    if (busy || readOnly) return;
    working(true); setError('');
    try {
      const response = await fetch(`${base}/${item.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error(action === 'complete' ? 'File chưa tải đủ. Chọn lại file gốc để tải lên.' : 'Chưa cập nhật được giấy tờ. Hãy thử lại.');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { working(false); }
  }
  const ready = documents.filter(item => !item.deleted && item.status === 'ready');
  return <section className="member-documents" aria-label="Giấy tờ của bản ghi">
    {!readOnly ? <>
      <div className="member-actions"><button type="button" className="btn btn-primary" disabled={busy || loading} onClick={() => photo.current?.click()}>Chụp giấy tờ</button>
        <button type="button" className="btn btn-quiet" disabled={busy || loading} onClick={() => files.current?.click()}>Chọn ảnh / PDF</button></div>
      <input hidden ref={photo} type="file" accept="image/*" capture="environment" onChange={e => { select(e.target.files); e.target.value = ''; }} />
      <input hidden ref={files} type="file" accept="image/*,application/pdf" multiple onChange={e => { select(e.target.files); e.target.value = ''; }} />
      <p className="state-note">Tối đa 15 MB/file sau xử lý ảnh. Giấy tờ giữ riêng trong gia đình; nội dung không tự điền vào bệnh án.</p>
    </> : null}
    {loading ? <p role="status">Đang tải giấy tờ…</p> : null}
    {error ? <p role="alert">{error} <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { setError(''); void load().catch(e => setError(e.message)); }}>Tải lại danh sách</button></p> : null}
    {message ? <p role="status">{message}</p> : null}
    {pending.filter(p => p.error && !p.done).map(p => <div className="member-document-row" key={p.id}><span>{p.file.name} · Chưa lưu</span>
      <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => void upload([p])}>Thử lại</button></div>)}
    {!loading && !documents.length ? <p className="state-note">Chưa có giấy tờ đính kèm.</p> : null}
    {documents.filter(item => !item.deleted).map(item => <div className="member-document-row" key={item.id}>
      {item.status === 'ready' ? <MedicalDocumentButton document={item} documents={ready} familyScope={{ memberId, recordId }} />
        : <span>{item.originalFilename} · Chưa tải đủ</span>}
      {!readOnly ? <div className="member-actions">
        {item.status === 'pending' ? <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => void change(item, 'complete')}>Kiểm tra tải lên</button> : null}
        <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => void change(item, 'remove')}>Gỡ</button>
      </div> : null}
    </div>)}
    {documents.some(item => item.deleted) ? <details><summary>Giấy tờ đã gỡ</summary>{documents.filter(item => item.deleted).map(item => <div className="member-document-row" key={item.id}><span>{item.originalFilename}</span>
      <button type="button" className="btn btn-quiet" disabled={busy || readOnly} onClick={() => void change(item, 'restore')}>Khôi phục</button></div>)}</details> : null}
  </section>;
}
