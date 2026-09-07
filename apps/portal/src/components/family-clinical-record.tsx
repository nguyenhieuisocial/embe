"use client";
import { CLINICAL_FIELDS, DOCUMENT_TYPES, HEALTH_STATUSES, type MemberRecord } from '../lib/family-members';

export function ClinicalRecordFields({ record, onChange }: { record: MemberRecord; onChange: (patch: Partial<MemberRecord>) => void }) {
  const change = (key: string, value: string) => onChange({ clinical: { ...record.clinical, [key]: value } });
  return <details className="member-group" open={undefined}>
    <summary>Chi tiết bệnh án <small>Chuyên khoa, kết quả, điều trị</small></summary>
    <div className="member-fields">
      <label>Loại giấy tờ<select value={record.clinical?.documentType ?? 'unspecified'} onChange={e => change('documentType', e.target.value)}>
        {Object.entries(DOCUMENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Tình trạng theo dõi<select value={record.clinical?.status ?? 'unspecified'} onChange={e => change('status', e.target.value)}>
        {Object.entries(HEALTH_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    {CLINICAL_FIELDS.map(field => <label key={field.key}>{field.label}{field.max > 200
      ? <textarea rows={2} maxLength={field.max} value={record.clinical?.[field.key] ?? ''} onChange={e => change(field.key, e.target.value)} />
      : <input maxLength={field.max} value={record.clinical?.[field.key] ?? ''} onChange={e => change(field.key, e.target.value)} />}</label>)}
    <p className="state-note">Ghi đúng nội dung trên giấy hoặc lời bác sĩ; không dùng ô này để tự chẩn đoán hay đổi liều thuốc.</p>
    <details className="member-group">
      <summary>Chỉ số xét nghiệm <small>{record.labResults?.length ?? 0} chỉ số</small></summary>
      {(record.labResults ?? []).map((row, index) => <fieldset className="member-lab-row" key={index}>
        <legend>Chỉ số {index + 1}</legend>
        {([['name', 'Tên xét nghiệm', 120], ['value', 'Kết quả trên phiếu', 120], ['unit', 'Đơn vị', 40], ['referenceRange', 'Khoảng tham chiếu trên phiếu', 120]] as const).map(([key, label, max]) =>
          <label key={key}>{label}<input required={key === 'name' || key === 'value'} maxLength={max} value={row[key]}
            onChange={e => onChange({ labResults: record.labResults!.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item) })} /></label>)}
        <button type="button" className="btn btn-quiet" onClick={() => onChange({ labResults: record.labResults!.filter((_, i) => i !== index) })}>Bỏ chỉ số {index + 1}</button>
      </fieldset>)}
      <button type="button" className="btn btn-quiet" disabled={(record.labResults?.length ?? 0) >= 12}
        onClick={() => onChange({ labResults: [...record.labResults ?? [], { name: '', value: '', unit: '', referenceRange: '' }] })}>Thêm chỉ số xét nghiệm</button>
      <p className="state-note">Giữ nguyên đơn vị và khoảng tham chiếu của phòng xét nghiệm. Chưa có dữ liệu thì để trống.</p>
    </details>
  </details>;
}

export function ClinicalRecordDetails({ record }: { record: MemberRecord }) {
  const c = record.clinical;
  return <>
    {c?.documentType && c.documentType !== 'unspecified' ? <p>{DOCUMENT_TYPES[c.documentType]}</p> : null}
    {c?.status && c.status !== 'unspecified' ? <p>{HEALTH_STATUSES[c.status]}</p> : null}
    <dl className="member-clinical-detail">{CLINICAL_FIELDS.filter(field => c?.[field.key]).map(field => <div key={field.key}><dt>{field.label}</dt><dd>{c![field.key]}</dd></div>)}</dl>
    {record.labResults?.length ? <dl className="member-clinical-detail">{record.labResults.map((row, i) => <div key={i}>
      <dt>{row.name}</dt><dd><strong>{row.value} {row.unit}</strong>{row.referenceRange ? <small>Tham chiếu trên phiếu: {row.referenceRange}</small> : null}</dd>
    </div>)}</dl> : null}
  </>;
}
