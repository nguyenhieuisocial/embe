import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MedicalDocumentSourceText from '../src/components/medical-document-source-text';

describe('independent document source viewer', () => {
  it('opens compactly, searches Vietnamese without accents and never renders source as markup', async () => {
    const text = 'Đường dùng: uống\nSố phiếu: INV-030\nGiữ cuối trang 0,005 mg\n<script>alert(1)</script>';
    const { container } = render(<MedicalDocumentSourceText text={text} page={2} kind="ocr" />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    const details = container.querySelector('details')!;
    details.open = true; fireEvent(details, new Event('toggle'));
    const input = await screen.findByRole('searchbox', { name: /Tìm trong chữ đọc từ ảnh trang 2/ });
    expect(screen.getByLabelText('Lớp chữ OCR trang 2').textContent).toBe(text);
    expect(container.querySelector('script')).toBeNull();
    fireEvent.change(input, { target: { value: 'duong dung' } });
    expect(screen.getByLabelText('Lớp chữ OCR trang 2').textContent).toBe('Đường dùng: uống');
    expect(screen.getByRole('status').textContent).toContain('1 dòng khớp');
    fireEvent.change(input, { target: { value: 'không tồn tại' } });
    expect(screen.getByRole('status').textContent).toContain('Kiểm tra thêm bản gốc');
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByLabelText('Lớp chữ OCR trang 2').textContent).toBe(text);
    details.open = false; fireEvent(details, new Event('toggle'));
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());
  });
  it('labels PDF independently, without editing or automatic import controls', async () => {
    const { container } = render(<MedicalDocumentSourceText text="PDF source" page={1} kind="pdf" />);
    const details = container.querySelector('details')!;
    details.open = true; fireEvent(details, new Event('toggle'));
    expect(await screen.findByLabelText('Lớp chữ PDF trang 1')).toBeTruthy();
    expect(screen.queryByLabelText(/Lớp chữ OCR/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
