import { expect, it } from 'vitest';
import { automaticDocumentImport } from '../src/lib/medical-auto-import';
import type { DocumentScan } from '../src/lib/medical-document-scan';
const scan = (): DocumentScan => ({ documentId: 'id', recordId: 'record', filename: 'file', mimeType: 'image/jpeg',
  status: 'confirmed', revision: 2, confirmedAt: '2026-09-08T00:00:00Z', completedPages: 1, pageCount: 1, error: null,
  analysis: { version: 1, pages: [{ page: 1, kind: 'laboratory', title: 'Xét nghiệm', warnings: [], medicines: [], charges: [],
    fields: [['Họ tên', 'Nguyễn Thị Ngân'], ['Ngày khám', '07/09/2026'], ['Cơ sở khám', 'Phòng khám gia đình']].map(([label, value]) => ({label, value, unit: '', reference: '', evidence: value, unclear: false})) }] } });
it('automatically proposes stored reviewed data for the exact mother', () => {
  expect(automaticDocumentImport(scan(), [], ' Nguyễn Thị Ngân ')?.occurredOn).toBe('2026-09-07');
});
it('does not call unreviewed OCR confirmed or guess identity', () => {
  const source = scan(); source.status = 'review';
  expect(automaticDocumentImport(source, [], 'Nguyễn Thị Ngân')).toBeNull();
  expect(automaticDocumentImport(scan(), [], 'Nguyen Thi Ngan')).toBeNull();
  expect(automaticDocumentImport(scan(), [], '')).toBeNull();
});
it('holds unclear dates and conflicting visits', () => {
  const source = scan(); source.analysis!.pages[0].fields[1].unclear = true;
  expect(automaticDocumentImport(source, [], 'Nguyễn Thị Ngân')).toBeNull();
  source.analysis!.pages[0].fields[1].unclear = false;
  source.analysis!.pages[0].fields.push({...source.analysis!.pages[0].fields[1], value: '08/09/2026'});
  expect(automaticDocumentImport(source, [], 'Nguyễn Thị Ngân')).toBeNull();
});
it('allows only exact policy notices after every medical row has been reviewed', () => {
  const source = scan();
  const page = source.analysis!.pages[0];
  page.kind = 'prescription';
  page.warnings = [
    'Tên thuốc, hàm lượng và cách dùng cần đối chiếu từng dòng; bản đọc không thay thế đơn gốc.',
    'Chẩn đoán, kết luận và lời dặn chỉ là chữ chép từ giấy; cần đối chiếu nguyên văn, không phải ý kiến y tế của EmBe.',
  ];
  page.medicines = [{ name: 'Thuốc theo đơn', ingredients: '', dose: '1 viên', frequency: '1 lần/ngày', instructions: 'Sau ăn', evidence: 'Thuốc theo đơn 1 viên 1 lần/ngày sau ăn', unclear: false }];
  const before = JSON.stringify(source);
  expect(automaticDocumentImport(source, [], 'Nguyễn Thị Ngân')?.medicines).toHaveLength(1);
  expect(JSON.stringify(source)).toBe(before);
  page.medicines[0].unclear = true;
  expect(automaticDocumentImport(source, [], 'Nguyễn Thị Ngân')).toBeNull();
  page.medicines[0].unclear = false;
  source.status = 'review';
  expect(automaticDocumentImport(source, [], 'Nguyễn Thị Ngân')).toBeNull();
  source.status = 'confirmed';
  expect(automaticDocumentImport(source, [], 'Người khác')).toBeNull();
  for (const warning of ['Thiếu trang cuối.', 'Tên hoặc cách dùng thuốc chưa khớp câu trích.', 'Cảnh báo mới chưa được phân loại.']) {
    page.warnings.push(warning);
    expect(automaticDocumentImport(source, [], 'Nguyễn Thị Ngân')).toBeNull();
    page.warnings.pop();
  }
});
