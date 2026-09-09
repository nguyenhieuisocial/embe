import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MedicalDocumentOverview from '../src/components/medical-document-overview';
import { buildDocumentOverview } from '../src/lib/medical-document-overview';
import type { DocumentAnalysis } from '../src/lib/medical-document-scan';
it('includes every extracted field beyond the highlights limit and navigates to its source', () => {
  const analysis: DocumentAnalysis = { version: 1, pages: [{ page: 1, kind: 'laboratory', title: 'Mẫu', warnings: [], medicines: [], charges: [], fields: Array.from({ length: 20 }, (_, index) => ({ label: `Chỉ số ${index}`, value: String(index), unit: 'mg', reference: 'Theo phiếu', evidence: 'Nguồn mẫu', unclear: false })) }] };
  const onSource = vi.fn();
  render(<MedicalDocumentOverview overview={buildDocumentOverview(analysis)} analysis={analysis} onSource={onSource} />);
  fireEvent.click(screen.getByText('Kết quả & chỉ số · 20 mục'));
  expect(screen.getByText('Chỉ số 19')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Xem nguồn Chỉ số 19 · trang 1' }));
  expect(onSource).toHaveBeenCalledWith({ page: 1, group: 'fields', rowIndex: 19 });
  fireEvent.click(screen.getByText('Thuốc trên tài liệu · 0 mục'));
  expect(screen.getAllByText('Chưa đọc được dữ liệu nhóm này.').some(node => node.closest('details')?.open)).toBe(true);
});
