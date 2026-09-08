import { documentFieldCategory } from './medical-document-overview';
import { withPrintedUnit, type DocumentAnalysis } from './medical-document-scan';

export const DOCUMENT_DATA_GROUPS = {
  identity: 'Người khám & cơ sở', visits: 'Ngày khám & lịch hẹn',
  findings: 'Kết luận & lời dặn trên giấy', results: 'Kết quả & chỉ số',
  medicines: 'Thuốc trên tài liệu', charges: 'Chi phí & thanh toán', other: 'Thông tin khác',
} as const;
export type DocumentDataRow = {
  page: number; sourceGroup: 'fields' | 'medicines' | 'charges'; index: number;
  label: string; value: string; details: string[]; evidence: string; unclear: boolean;
  duplicateCount?: number;
  sourceIndexes?: number[];
};
const labelKey = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Explicit aliases only: a diagnosis is not a conclusion, and a birth date is not a visit date.
const synonymousLabels = [
  ['ho ten', 'ho va ten', 'ten benh nhan', 'ho ten benh nhan', 'ho va ten benh nhan', 'ho ten nguoi benh', 'ten nguoi benh', 'patient name', 'patient full name'],
  ['ma benh nhan', 'ma nguoi benh', 'patient id', 'patient identifier'],
  ['ngay sinh', 'date of birth'], ['ngay kham', 'ngay kham benh', 'visit date'],
  ['ngay tai kham', 'ngay hen tai kham'], ['ngay du sinh', 'expected due date'],
  ['hgb', 'hb', 'hemoglobin'], ['wbc', 'bach cau'], ['rbc', 'hong cau'],
  ['plt', 'tieu cau'], ['hct', 'hematocrit'], ['creatinine', 'creatinin'],
];
function canonicalLabel(value: string) {
  const key = labelKey(value);
  return synonymousLabels.find(labels => labels.includes(key))?.[0] ?? key;
}
export type ImportedDocumentData = {
  documentId: string; recordId: string; importedAt: string; analysis: DocumentAnalysis;
  sourceSnapshot?: boolean;
  automaticallyExtracted?: boolean;
};
// A lossless view over the immutable import snapshot, not another clinical database.
// Unknown fields stay visible. Currency, comparison signs and context are never coerced.
export function groupDocumentData(analysis: DocumentAnalysis) {
  const groups = Object.fromEntries(Object.keys(DOCUMENT_DATA_GROUPS).map(key => [key, []])) as unknown as Record<keyof typeof DOCUMENT_DATA_GROUPS, DocumentDataRow[]>;
  for (const page of analysis.pages) {
    page.fields.forEach((row, index) => {
      const category = documentFieldCategory(row.label);
      const label = row.label.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s*[:：]\s*$/, '').trim();
      const freeText = /^(?:tieu de|doan van|chan trang|chu thich|chu tren dau|chu ky|ten bang|tieu de cot|dieu khoan|ghi chu ben le|ma bieu mau|phien ban)(?:\s|$)/.test(label);
      const administrative = ['bac si', 'bac si kham', 'bac si dieu tri', 'doctor', 'clinician', 'gioi tinh', 'dia chi', 'so dien thoai', 'ma ho so', 'so benh an', 'so the bhyt', 'so can cuoc'].includes(label);
      const financial = ['tong tien', 'tong cong', 'thanh tien', 'da thanh toan', 'so tien da thu', 'con no', 'con lai', 'tam ung', 'mien giam', 'bao hiem thanh toan', 'so phieu thu', 'so hoa don', 'invoice total', 'amount paid', 'balance due'].includes(label)
        || /^(?:VND|VNĐ|đ|USD|EUR)$/i.test(row.unit.trim());
      const metric = /^(?:crl|nt|bpd|hc|ac|fl|efw|afi|fhr|hgb|hb|hct|plt|rbc|wbc|glucose|hba1c|tsh|ft4|ast|alt|ferritin|bmi|can nang|chieu cao|huyet ap|nhip tim|tim thai|tuoi thai|tuan thai)(?:\s|$)/.test(label);
      const medication = /^(?:ten thuoc|hoat chat|thanh phan thuoc|ham luong thuoc|lieu dung|lieu uong|cach uong thuoc|cach dung thuoc|duong dung|tan suat dung thuoc|thoi gian dung thuoc)(?:\s|$)/.test(label);
      const clinicalMetric = metric || ['hemoglobin', 'hematocrit', 'bach cau', 'hong cau', 'tieu cau', 'creatinine', 'creatinin', 'ure', 'urea', 'spo2', 'nhiet do', 'nhip tho', 'mach'].includes(label);
      const key = freeText ? 'other' : financial ? 'charges' : administrative || category === 'patient' || category === 'patient-id' || category === 'facility' ? 'identity'
        : category === 'date' ? 'visits' : category === 'conclusion' || category === 'instructions' ? 'findings'
          : medication ? 'medicines' : row.unit || row.reference || clinicalMetric ? 'results' : 'other';
      groups[key].push({ page: page.page, sourceGroup: 'fields', index, label: row.label, value: withPrintedUnit(row.value, row.unit),
        details: [row.context && `Thời điểm / ngữ cảnh: ${row.context}`, row.reference && `Tham chiếu in trên phiếu: ${row.reference}`,
          row.pdfValue && row.pdfValue !== row.value && `Chữ PDF khác bản đã lưu: ${row.pdfValue}`].filter(Boolean) as string[], evidence: row.evidence, unclear: row.unclear });
    });
    page.medicines.forEach((row, index) => groups.medicines.push({ page: page.page, sourceGroup: 'medicines', index,
      label: row.name, value: [row.dose, row.frequency].filter(Boolean).join(' · '), evidence: row.evidence, unclear: row.unclear,
      details: [row.ingredients && `Thành phần: ${row.ingredients}`, row.route && `Đường dùng: ${row.route}`, row.duration && `Thời gian: ${row.duration}`,
        row.quantity && `Số lượng cấp: ${row.quantity}`, row.instructions].filter(Boolean) as string[] }));
    page.charges.forEach((row, index) => groups.charges.push({ page: page.page, sourceGroup: 'charges', index,
      label: row.label, value: withPrintedUnit(row.amount, row.currency), evidence: row.evidence, unclear: row.unclear,
      details: [row.quantity && `Số lượng: ${row.quantity}`, row.unitPrice && `Đơn giá: ${row.unitPrice}`].filter(Boolean) as string[] }));
  }
  // Collapse only identical source fields on the SAME page. Separate visits/pages,
  // medicine lines and charges may legitimately repeat and must never be merged.
  for (const [group, rows] of Object.entries(groups)) {
    const seen = new Map<string, DocumentDataRow>();
    groups[group as keyof typeof groups] = rows.filter(row => {
      if (row.sourceGroup !== 'fields' || group === 'charges' || group === 'medicines') return true;
      // Values remain accent-, case-, unit- and context-sensitive. Never collapse
      // medicines/charges or separate pages, even when they look identical.
      const literal = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
      const signature = JSON.stringify([row.page, canonicalLabel(row.label), literal(row.value), row.details.map(literal), row.unclear]);
      const prior = seen.get(signature);
      if (prior) {
        prior.duplicateCount = (prior.duplicateCount ?? 1) + 1;
        prior.sourceIndexes = [...(prior.sourceIndexes ?? [prior.index]), row.index];
        if (row.evidence && !prior.evidence.split('\n').includes(row.evidence)) prior.evidence = [prior.evidence, row.evidence].filter(Boolean).join('\n');
        return false;
      }
      seen.set(signature, row); return true;
    });
  }
  return groups;
}
