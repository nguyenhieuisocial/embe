import { expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MedicationUseGuide from '../src/components/medication-use-guide';
it('shows the saved dose and schedule, without prescribing a replacement dose', () => {
  render(<MedicationUseGuide name="Axit folic" dose="Theo đơn đã lưu" times={['08:00:00']} instructions="Sau ăn" />);
  fireEvent.click(screen.getByText(/Cách dùng & thông tin thuốc/));
  expect(screen.getByText(/Theo đơn đã lưu/)).toBeVisible();
  expect(screen.getByText(/08:00/)).toBeVisible();
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.nhs.uk/medicines/folic-acid/');
});
it('does not guess the use of an unknown brand or combination', () => {
  render(<MedicationUseGuide name="Vitamin D3 + sản phẩm khác" dose="" times={[]} instructions="" />);
  fireEvent.click(screen.getByText(/Cách dùng & thông tin thuốc/));
  expect(screen.getByText(/Chưa có thông tin công dụng được xác minh/)).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
