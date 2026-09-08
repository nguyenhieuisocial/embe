import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { groupDocumentData } from '../src/lib/medical-document-data';
import type { DocumentAnalysis } from '../src/lib/medical-document-scan';
import MedicalDocumentData from '../src/components/medical-document-data';

const id = '11111111-1111-4111-8111-111111111111';
const field = (label: string, value: string, unit = '', context = '') => ({ label, value, unit, context, reference: '', evidence: value, unclear: true });
const analysis: DocumentAnalysis = { version: 1, pages: [{ page: 1, kind: 'laboratory', title: 'Mẫu', fields: [
  field('Họ tên', 'NGƯỜI MẪU'), field('Ngày tái khám', '10/9/2026'), field('Chẩn đoán', 'Nội dung nguyên văn'), field('Lời dặn', 'Theo hẹn'),
  field('Glucose', '4,8', 'mmol/L', 'Lúc đói'), field('Glucose', '< 6', 'mmol/L', 'Sau ăn 1 giờ'), field('Bác sĩ', 'BÁC SĨ MẪU'),
  field('Đã thanh toán', '001.000', 'VND'), field('Thông tin chưa biết', '<script>không thực thi</script>'),
], medicines: [{ name: 'THUỐC MẪU', ingredients: '200 mg', dose: '', frequency: '', instructions: 'Nguyên văn', quantity: '30 viên', evidence: '', unclear: true }],
charges: [{ label: 'Chưa thu', amount: '300.000', currency: 'VND', quantity: '2', unitPrice: '150.000', evidence: '', unclear: true }], warnings: [] }] };
afterEach(() => vi.unstubAllGlobals());
it('groups synonymous fields without losing source evidence or changing saved data', () => {
  const a = structuredClone(analysis);
  a.pages[0].fields.push({...field('Tên bệnh nhân:', 'NGƯỜI MẪU'), evidence: 'Tên bệnh nhân: NGƯỜI MẪU'});
  const before = structuredClone(a);
  const rows = groupDocumentData(a).identity;
  const patient = rows.find(row => row.label === 'Họ tên')!;
  expect(patient.duplicateCount).toBe(2);
  expect(patient.sourceIndexes).toEqual([0, 9]);
  expect(patient.evidence).toContain('Tên bệnh nhân: NGƯỜI MẪU');
  expect(rows.filter(row => row.value === 'NGƯỜI MẪU')).toHaveLength(1);
  expect(a).toEqual(before);
});
it('automatically routes medication instructions and named lab values into their groups', () => {
  const a = structuredClone(analysis);
  a.pages[0].fields.push(field('Cách uống thuốc', 'Sau ăn'), field('Hemoglobin', '12'), field('HGB', '12'));
  const groups = groupDocumentData(a);
  expect(groups.medicines.some(row => row.label === 'Cách uống thuốc')).toBe(true);
  expect(groups.results.find(row => row.label === 'Hemoglobin')?.duplicateCount).toBe(2);
  expect(groups.other.some(row => row.label === 'Hemoglobin')).toBe(false);
});
it('never merges different dates, identities, units or clinician roles', () => {
  const a = structuredClone(analysis);
  a.pages[0].fields = [field('Ngày sinh', '07/09/2026'), field('Ngày khám', '07/09/2026'),
    field('Họ tên', 'Đỗ'), field('Tên bệnh nhân', 'Do'), field('Hb','12','g/dL'), field('Hemoglobin','12','g/L'),
    field('Bác sĩ khám', 'A'), field('Bác sĩ điều trị', 'A')];
  expect(Object.values(groupDocumentData(a)).flat().filter(row => row.sourceGroup === 'fields')).toHaveLength(8);
});
it('exposes automatically saved scan groups and full text without confirming or importing', async () => {
  const a = structuredClone(analysis);
  a.pages[0].pdfText = 'Mã tài liệu ngoài biểu mẫu 000123';
  a.pages[0].warnings = ['Chưa đọc rõ chữ cuối trang'];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ documentId: id, recordId: id, status: 'review', analysis: a }));
  vi.stubGlobal('fetch', fetcher);
  render(<MedicalDocumentData document={{ id, originalFilename: 'sample.pdf', mimeType: 'application/pdf', byteSize: 100, createdAt: '', scanStatus: 'review', imported: false }} recordId={id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Xem thông tin đã phân loại' }));
  await screen.findByRole('searchbox');
  expect(fetcher).toHaveBeenCalledWith(`/api/pregnancy/documents/${id}/scan`, expect.objectContaining({ cache: 'no-store' }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Bản đọc tự động · chưa xác minh chuyên môn.')).toBeVisible();
  fireEvent.click(screen.getByText('Phần bộ đọc chưa chắc chắn'));
  expect(screen.getByText('Trang 1: Chưa đọc rõ chữ cuối trang')).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '000123' } });
  expect(screen.getByText('Mã tài liệu ngoài biểu mẫu 000123')).toBeVisible();
  expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it('keeps every row exactly once, every source page, contextual values and receipt amounts verbatim', () => {
  const before = structuredClone(analysis); const groups = groupDocumentData(analysis);
  expect(Object.values(groups).flat()).toHaveLength(11);
  expect(new Set(Object.values(groups).flat().map(row => `${row.page}:${row.sourceGroup}:${row.index}`)).size).toBe(11);
  expect(groups.results.filter(row => row.label === 'Glucose').map(row => row.value)).toEqual(['4,8 mmol/L', '< 6 mmol/L']);
  expect(groups.charges.map(row => row.value)).toEqual(['001.000 VND', '300.000 VND']);
  expect(groups.medicines[0].details).toContain('Số lượng cấp: 30 viên'); expect(groups.medicines[0].value).toBe('');
  expect(groups.identity.map(row => row.label)).toEqual(['Họ tên', 'Bác sĩ']); expect(groups.findings).toHaveLength(2);
  expect(analysis).toEqual(before);
});
it('does not mislabel headers and footer text as laboratory measurements', () => {
  const a = structuredClone(analysis);
  a.pages[0].fields.push(field('Chân trang', 'Không dùng để điều trị'), field('Tiêu đề cột', 'Tên xét nghiệm | Kết quả'));
  const groups = groupDocumentData(a);
  expect(groups.other.map(row => row.label)).toEqual(['Thông tin chưa biết', 'Chân trang', 'Tiêu đề cột']);
});
it('collapses exact fields but preserves differing context, pages, uncertainty and financial lines', () => {
  const a = structuredClone(analysis);
  const glucose = structuredClone(a.pages[0].fields[4]);
  a.pages[0].fields.push(glucose, { ...glucose, context: 'Sau ăn' }, { ...glucose, unclear: false });
  a.pages[0].fields.push(structuredClone(a.pages[0].fields[7]));
  a.pages.push({ ...structuredClone(a.pages[0]), page: 2, fields: [glucose], medicines: [], charges: [] });
  const before = structuredClone(a);
  const groups = groupDocumentData(a);
  expect(groups.results.find(r => r.page === 1 && r.details.includes('Thời điểm / ngữ cảnh: Lúc đói') && r.unclear)?.duplicateCount).toBe(2);
  expect(groups.results.filter(r => r.label === 'Glucose')).toHaveLength(5);
  expect(groups.charges.filter(r => r.label === 'Đã thanh toán')).toHaveLength(2);
  expect(a).toEqual(before);
});
it('fetches on demand, searches without accents, preserves uncertainty and never renders source HTML', async () => {
  const fetcher = vi.fn(async () => Response.json({ documentId: id, recordId: id, importedAt: '2026-09-08T00:00:00Z', analysis }));
  vi.stubGlobal('fetch', fetcher);
  render(<MedicalDocumentData document={{ id, originalFilename: 'sample.pdf', mimeType: 'application/pdf', byteSize: 100, createdAt: '' }} recordId={id} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Xem thông tin đã phân loại' }));
  await screen.findByRole('searchbox'); expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sau an' } });
  expect(screen.getByText('< 6 mmol/L')).toBeVisible(); expect(screen.queryByText('4,8 mmol/L')).not.toBeInTheDocument();
  expect(screen.getByText('Cần đối chiếu bản gốc')).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '<script>' } });
  expect(screen.getByText('<script>không thực thi</script>', { selector: 'p' })).toBeVisible(); expect(document.querySelector('script')).toBeNull();
});
it('rejects data belonging to another record', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ documentId: id, recordId: 'other', analysis })));
  render(<MedicalDocumentData document={{ id, originalFilename: 'sample.pdf', mimeType: 'application/pdf', byteSize: 100, createdAt: '' }} recordId={id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Xem thông tin đã phân loại' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa xác minh được'); expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});
it('searches and exposes the entire independent text including content without a mapped field', async () => {
  const a = structuredClone(analysis);
  a.pages[0].pdfText = 'Nội dung cuối trang: MÃ NGOÀI BIỂU MẪU 000123\nĐịa chỉ xuất hóa đơn';
  a.pages[0].ocrText = 'Toàn bộ nội dung viết tay chưa phân loại'; a.pages[0].ocrEngine = 'tesseract-vie-eng';
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ documentId: id, recordId: id, analysis: a, sourceSnapshot: true })));
  render(<MedicalDocumentData document={{ id, originalFilename: 'sample.pdf', mimeType: 'application/pdf', byteSize: 100, createdAt: '' }} recordId={id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Xem thông tin đã phân loại' }));
  const search = await screen.findByRole('searchbox', { name: 'Tìm trong tài liệu' });
  fireEvent.change(search, { target: { value: 'ngoai bieu mau' } });
  expect(await screen.findByText('Nội dung cuối trang: MÃ NGOÀI BIỂU MẪU 000123')).toBeVisible();
  fireEvent.click(screen.getByText('Toàn văn từng trang · kể cả phần chưa phân loại'));
  fireEvent.click(screen.getByText('Chữ từ PDF · trang 1'));
  expect(await screen.findByLabelText('Lớp chữ PDF trang 1')).toHaveTextContent('Địa chỉ xuất hóa đơn');
});
