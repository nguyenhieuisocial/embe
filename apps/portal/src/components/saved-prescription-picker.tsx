'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { validDocumentAnalysis, type DocumentAnalysis } from '../lib/medical-document-scan';
import { normalizeMedicalRecord, type MedicalMedicine, type MedicalRecord } from '../lib/pregnancy-medical';
import { medicalDocumentName } from '../lib/medical-document-name';
import {medicineDisplayGroups,medicineSourceGroups,uniqueMedicineReadings} from '../lib/medicine-display-groups';
import {subscribeFamilyDataRefresh} from '../lib/family-data-refresh';

export type SavedPrescriptionMedicine = MedicalMedicine & { source: string; href: string; uncertain: boolean };
/** Reuses existing private records and scans; never queues OCR or uploads a copy. */
export default function SavedPrescriptionPicker({ onSelect }: { onSelect: (medicine: SavedPrescriptionMedicine) => void }) {
  const [rows, setRows] = useState<SavedPrescriptionMedicine[]>([]);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(()=>subscribeFamilyDataRefresh(()=>setRetry(n=>n+1)),[]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false); setRows([]);
    void (async () => {
      const result: SavedPrescriptionMedicine[] = [];
      try {
        const response = await fetch('/api/pregnancy/records', {cache:'no-store', signal:controller.signal});
        if (!response.ok) throw new Error('records');
        const body = await response.json();
        if (!Array.isArray(body.records)) throw new Error('records');
        const records: MedicalRecord[] = body.records.flatMap((raw: unknown) => { const record = normalizeMedicalRecord(raw); return record ? [record] : []; });
        const documents = records.flatMap(record => record.documents.map(document => ({document,record})));
        for (const record of records.filter(record=>record.kind!=='receipt')) for (const medicine of record.medicines) result.push({...medicine, source:record.title, href:`/me-bau/ho-so#record-${record.id}`, uncertain:false});
        let incomplete = false;
        for (let offset = 0; offset < documents.length; offset += 3) {
          const batch = await Promise.all(documents.slice(offset, offset+3).map(async ({document,record}) => {
            try {
              const response = await fetch(`/api/pregnancy/documents/${document.id}/scan`, {cache:'no-store', signal:controller.signal});
              if (!response.ok) throw new Error('scan');
              const scan = await response.json();
              if (scan.documentId !== document.id || scan.recordId !== record.id) throw new Error('identity');
              if (!['review','confirmed'].includes(scan.status)) return [];
              if (!validDocumentAnalysis(scan.analysis)) throw new Error('analysis');
              const analysis: DocumentAnalysis = scan.analysis;
              return analysis.pages.filter(page=>page.kind!=='receipt').flatMap(page => page.medicines.filter(m => m.name.trim()).map(m => ({
                name:m.name, dose:m.dose, frequency:m.frequency, ingredients:m.ingredients,
                instructions:[m.instructions, m.route && `Đường dùng: ${m.route}`, m.duration && `Thời gian: ${m.duration}`, m.quantity && `Số lượng: ${m.quantity}`].filter(Boolean).join(' · '),
                source:medicalDocumentName([scan.analysis]), href:`/me-bau/ho-so/tai-lieu/${document.id}`, uncertain:m.unclear || page.warnings.length>0 || scan.status !== 'confirmed',
              })));
            } catch { incomplete = true; return []; }
          }));
          result.push(...batch.flat());
        }
        if (!controller.signal.aborted) { setRows(result); setFailed(incomplete); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [retry]);
  return <section className="care-plan-form" aria-label="Thuốc từ hồ sơ đã lưu">
    <h3>Thuốc từ hồ sơ đã lưu</h3>
    <p>Chọn thuốc để điền sẵn. Không cần chụp hoặc nhập lại đơn.</p>
    {loading ? <p role="status">Đang lấy thuốc từ hồ sơ…</p> : null}
    {failed ? <p role="alert">Chưa tải đủ giấy tờ. <button type="button" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></p> : null}
    {!loading && !failed && !rows.length ? <p>Chưa có thuốc trong dữ liệu đã đọc. <Link href="/me-bau/ho-so">Xem giấy tờ đã lưu</Link></p> : null}
    {!loading ? medicineDisplayGroups(rows,row=>row.name).map(group=><article key={group.name} style={{overflowWrap:'anywhere',marginBlock:12}}>
      <strong>{group.name}</strong><small style={{display:'block'}}>{medicineSourceGroups(group.rows,row=>row.href).length} giấy tờ nguồn</small>
      {medicineSourceGroups(group.rows,row=>row.href).map(raw=>({...raw,rows:uniqueMedicineReadings(raw.rows,row=>[row.dose,row.frequency,row.instructions,JSON.stringify(row.ingredients)],(a,b)=>({...a,uncertain:a.uncertain||b.uncertain}))})).map(source=><details key={source.source}>
      <summary style={{minHeight:44,paddingBlock:12}}>{source.rows[0].source}</summary>
      <Link href={source.source}>Xem giấy tờ gốc</Link>
      {source.rows.length>1?<small style={{display:'block'}}>Cùng một giấy tờ có {source.rows.length} bản đọc cách dùng; không phải các đơn riêng.</small>:null}
      {source.rows.map((row,index)=><div key={index}>
      {source.rows.length>1?<strong>Bản đọc {index+1}</strong>:null}
      <p>{[row.dose,row.frequency,row.instructions].filter(Boolean).join(' · ') || 'Chưa đọc được cách dùng'}</p>
      {row.uncertain ? <small style={{display:'block'}}>Bản đọc chưa chắc chắn — kiểm tra thông tin điền sẵn.</small> : null}
      <button className="care-add-button" type="button" onClick={()=>onSelect(row)}>Dùng thông tin thuốc này</button>
      </div>)}
      </details>)}
    </article>) : null}
  </section>;
}
