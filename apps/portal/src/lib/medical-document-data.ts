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
};
export type ImportedDocumentData = {
  documentId: string; recordId: string; importedAt: string; analysis: DocumentAnalysis;
  sourceSnapshot?: boolean;
};
// A lossless view over the immutable import snapshot, not another clinical database.
// Unknown fields stay visible. Currency, comparison signs and context are never coerced.
export function groupDocumentData(analysis: DocumentAnalysis) {
  const groups = Object.fromEntries(Object.keys(DOCUMENT_DATA_GROUPS).map(key => [key, []])) as unknown as Record<keyof typeof DOCUMENT_DATA_GROUPS, DocumentDataRow[]>;
  for (const page of analysis.pages) {
    page.fields.forEach((row, index) => {
      const category = documentFieldCategory(row.label);
      const label = row.label.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s*[:：]\s*$/, '').trim();
      const administrative = ['bac si', 'bac si kham', 'bac si dieu tri', 'doctor', 'clinician', 'gioi tinh', 'dia chi', 'so dien thoai', 'ma ho so', 'so benh an', 'so the bhyt', 'so can cuoc'].includes(label);
      const financial = ['tong tien', 'tong cong', 'thanh tien', 'da thanh toan', 'so tien da thu', 'con no', 'con lai', 'tam ung', 'mien giam', 'bao hiem thanh toan', 'so phieu thu', 'so hoa don', 'invoice total', 'amount paid', 'balance due'].includes(label)
        || /^(?:VND|VNĐ|đ|USD|EUR)$/i.test(row.unit.trim());
      const key = financial ? 'charges' : administrative || category === 'patient' || category === 'patient-id' || category === 'facility' ? 'identity'
        : category === 'date' ? 'visits' : category === 'conclusion' || category === 'instructions' ? 'findings'
          : row.unit || row.reference || row.context || ['laboratory', 'ultrasound'].includes(page.kind) ? 'results' : 'other';
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
  return groups;
}
