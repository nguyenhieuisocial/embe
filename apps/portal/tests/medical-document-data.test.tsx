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
