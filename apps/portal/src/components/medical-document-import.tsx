'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DOCUMENT_TYPES, type DocumentAnalysis } from '../lib/medical-document-scan';
import { proposeDocumentImport, validImportDetails, type DocumentImportContext, type DocumentImportDetails } from '../lib/medical-document-import';
import { MEDICAL_MEASUREMENTS } from '../lib/medical-measurements';
import { clearPrivateGetCache } from '../lib/private-get-cache';

export default function MedicalDocumentImport({ documentId, recordId, revision, analysis, disabled, onImported, onBusy, onDirty }: {
  documentId: string; recordId: string; revision: number; analysis: DocumentAnalysis; disabled: boolean; onImported: () => Promise<void>;
  onBusy?: (busy: boolean) => void; onDirty?: () => void;
}) {
  const [context, setContext] = useState<DocumentImportContext | null>(null);
  const [overrides, setOverrides] = useState<Partial<DocumentImportDetails>>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [ack, setAck] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [retry, setRetry] = useState(0); const [done, setDone] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    let ignore = false;
    void fetch(`/api/pregnancy/documents/${documentId}/import`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Chưa tải được hồ sơ để khớp. Bản đọc vẫn còn nguyên.');
      const result = await response.json();
      if (!Array.isArray(result?.records) || typeof result.recordUpdatedAt !== 'string' || typeof result.intake !== 'boolean' || typeof result.imported !== 'boolean') throw new Error('Chưa tải được thông tin khớp hồ sơ. Có thể lưu riêng bản đọc rồi thử lại.');
      if (!ignore) { setContext(result); setError(''); }
    }).catch(e => { if (!ignore) setError(e.message); });
    return () => { ignore = true; };
  }, [documentId, revision, retry]);
  const proposal = useMemo(() => proposeDocumentImport(analysis, context?.records ?? [], recordId), [analysis, context, recordId]);
  const details: DocumentImportDetails = { ...proposal.details, ...overrides,
    measurements: Object.fromEntries(Object.entries(proposal.details.measurements).filter(([key]) => !excluded.includes(key))),
    medicines: proposal.details.medicines.filter((_, i) => !excluded.includes(`medicine-${i}`)),
  };
  useEffect(() => { setAck(false); }, [analysis, overrides, excluded]);
  const change = (patch: Partial<DocumentImportDetails>) => { setOverrides(current => ({ ...current, ...patch })); setError(''); onDirty?.(); };
  const exclude = (key: string, included: boolean) => { setExcluded(current => included ? current.filter(k => k !== key) : [...current, key]); onDirty?.(); };
  async function importRecord() {
    if (!context || !ack || busy || !validImportDetails(details)) return;
    setBusy(true); onBusy?.(true); setError('');
    try {
      const response = await fetch(`/api/pregnancy/documents/${documentId}/import`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysis, details, revision, recordUpdatedAt: context.recordUpdatedAt, confirmed: true, patientConfirmed: true }), signal: AbortSignal.timeout(20000) });
      if (response.status === 409) { setConflict(true); throw new Error('Hồ sơ đã thay đổi, hoặc có số đo/thuốc khác với bản đã lưu. EmBe chưa ghi đè. Mở hồ sơ để đối chiếu rồi nạp lại trang.'); }
      if (!response.ok) throw new Error('Chưa thêm được vào hồ sơ. Bản đang sửa vẫn còn; có thể thử lại.');
      const saved = await response.json(); if (!saved.imported || saved.recordId !== recordId) throw new Error('Chưa xác minh được kết quả lưu.');
      clearPrivateGetCache('/api/pregnancy/records'); setDone(true); await onImported();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); onBusy?.(false); }
  }
  if (context?.imported || done) return <aside className="document-import document-import-done" role="status">
    <strong>Đã thêm dữ liệu vào hồ sơ</strong><Link href={`/me-bau/ho-so#record-${recordId}`}>Xem hồ sơ đã cập nhật</Link>
    <small>Sửa bản đọc sau này không tự đổi dữ liệu đã nhập. Sửa chỉ số hoặc thuốc tại hồ sơ.</small>
  </aside>;
  return <fieldset className="document-import" disabled={disabled || busy}>
    <legend>Khớp & thêm vào hồ sơ</legend>
    {!context ? <p role="status">{error || 'Đang tìm hồ sơ và cơ sở khám…'}{error ? <button type="button" onClick={() => setRetry(n => n + 1)}>Thử lại</button> : null}</p> : <>
      <p className="document-patient">Tên trên giấy: <strong>{proposal.patients.join(' · ') || 'Chưa đọc được — cần xem bản gốc'}</strong></p>
      <p>{context.intake ? 'Thông tin được điền từ bản đọc; Mẹ có thể sửa trước khi lưu.' : 'Bổ sung vào hồ sơ đang chứa tài liệu. Giữ ngày, tên, ghi chú và dữ liệu đã có; không ghi đè.'}</p>
      <p><strong>{DOCUMENT_TYPES[details.kind]}</strong> · {details.occurredOn ? details.occurredOn.split('-').reverse().join('/') : 'Chưa rõ ngày'}<br />{details.provider || 'Chưa rõ cơ sở khám'}</p>
      <details className="document-import-values"><summary>Kiểm tra ngày, cơ sở và lần khám</summary>
      <label>Loại hồ sơ<select value={details.kind} disabled={!context.intake} onChange={e => change({ kind: e.target.value })}>{Object.entries(DOCUMENT_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <label>Tên hồ sơ<input value={details.title} maxLength={100} disabled={!context.intake} onChange={e => change({ title: e.target.value })} /></label>
      <label>Ngày khám / ngày trên giấy<input type="date" value={details.occurredOn} onChange={e => change({ occurredOn: e.target.value, linkedRecordId: null })} /></label>
      {!details.occurredOn ? <small>Chưa đọc được ngày. Chọn đúng ngày trên giấy, không dùng ngày tải lên.</small> : null}
      <label>Cơ sở khám<input value={details.provider} maxLength={120} list="medical-provider-history" onChange={e => change({ provider: e.target.value, linkedRecordId: null })} /></label>
      <datalist id="medical-provider-history">{[...new Set(context.records.map(r => r.provider).filter(Boolean))].map(p => <option key={p} value={p} />)}</datalist>
      <label>Bác sĩ<input value={details.clinician} maxLength={100} onChange={e => change({ clinician: e.target.value })} /></label>
      <label>Tuần thai ghi trên giấy<input type="number" inputMode="numeric" min={1} max={42} value={details.gestationalWeek ?? ''} onChange={e => change({ gestationalWeek: e.target.value ? Number(e.target.value) : null })} /></label>
      <label>Liên kết lần khám<select value={details.linkedRecordId ?? ''} onChange={e => change({ linkedRecordId: e.target.value || null })}>
        <option value="">Lưu riêng, chưa liên kết</option>
        {context.records.filter(r => r.id !== recordId && !r.documentIntake).map(r => <option key={r.id} value={r.id}>{r.title} · {new Date(r.occurredAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {r.provider}</option>)}
      </select></label>
      <small>{proposal.candidates.length === 1 && details.linkedRecordId === proposal.candidates[0].id ? 'Đã gợi ý khớp cùng ngày và cơ sở. Kiểm tra đúng người, đúng lần khám trước khi xác nhận.' : proposal.candidates.length > 1 ? 'Có nhiều hồ sơ cùng ngày và cơ sở; chọn đúng lần khám.' : 'Không tự ghép khi chưa đủ thông tin.'}</small>
      </details>
      {!details.occurredOn ? <p>Mở mục kiểm tra phía trên để bổ sung ngày trên giấy trước khi thêm vào hồ sơ.</p> : null}
      {details.linkedRecordId ? <p>Liên kết: {context.records.find(r => r.id === details.linkedRecordId)?.title}</p> : null}
      <details className="document-import-values"><summary>Dữ liệu sẽ thêm · {Object.keys(details.measurements).length} chỉ số · {details.medicines.length} thuốc</summary>
        {Object.entries(proposal.details.measurements).map(([key, value]) => { const metric = MEDICAL_MEASUREMENTS.find(m => m.key === key)!; return <label className="document-check" key={key}><input type="checkbox" checked={!excluded.includes(key)} onChange={e => exclude(key, e.target.checked)} />{metric.label}: {value} {metric.unit}</label>; })}
        {proposal.details.medicines.map((m, i) => <label className="document-check" key={i}><input type="checkbox" checked={!excluded.includes(`medicine-${i}`)} onChange={e => exclude(`medicine-${i}`, e.target.checked)} />{m.name} · {[m.dose, m.frequency].filter(Boolean).join(' · ')}</label>)}
        <p>Để sửa giá trị, mở mục tương ứng trong bản đọc bên dưới. Chỉ số khác đơn vị hoặc nhiều kết quả được giữ nguyên văn, không tự chuyển đổi.</p>
      </details>
      {proposal.unresolved ? <p>{proposal.unresolved} mục chưa rõ: vẫn lưu trong tài liệu, chưa đưa vào chỉ số/thuốc. Đối chiếu rồi bỏ dấu “vẫn cần kiểm tra” ở từng dòng nếu đã đọc đúng.</p> : null}
      {proposal.warnings.length ? <ul>{proposal.warnings.map((text, i) => <li key={i}>{text}</li>)}</ul> : null}
      <small>Giữ toàn bộ bản đọc, khoản thu, lời dặn và bản gốc trong tài liệu liên kết. Không tự tạo chi tiêu, nhắc uống thuốc hay đổi lịch hẹn.</small>
      <label className="document-check"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />Đây là giấy tờ của Mẹ Ngân; tôi đã đối chiếu thông tin và dữ liệu sẽ thêm với bản gốc.</label>
      {proposal.patients.length > 1 ? <p role="alert">Có nhiều tên người bệnh. Tách giấy tờ theo từng người; chưa thể nhập chung vào hồ sơ Mẹ.</p> : null}
      <button className="document-import-confirm" type="button" disabled={!ack || busy || conflict || proposal.patients.length > 1 || !validImportDetails(details)} onClick={() => void importRecord()}>{busy ? 'Đang thêm vào hồ sơ…' : 'Xác nhận & thêm vào hồ sơ'}</button>
      {error ? <p role="alert">{error}</p> : null}
      {conflict ? <Link href={`/me-bau/ho-so#record-${recordId}`}>Mở hồ sơ đang có</Link> : null}
    </>}
  </fieldset>;
}
