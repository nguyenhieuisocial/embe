import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudioResearchPage from '../src/app/studio/nghien-cuu/page';
import { editorialSeries, researchTools } from '../src/content/studio-research';

vi.mock('../src/components/app-header', () => ({ default: () => null }));

describe('Studio research transparency', () => {
  it('distinguishes indexed posts and editorial proposals from completed reviewed work', () => {
    render(<StudioResearchPage />);
    expect(screen.getByText(/Chưa đọc hết từng ảnh/)).toBeInTheDocument();
    expect(screen.getByText(/không phải 12 video đã làm xong/)).toBeInTheDocument();
    expect(editorialSeries).toHaveLength(12);
    expect(screen.getByRole('link', { name: '‹ Về Studio' })).toHaveAttribute('href', '/studio');
  });
  it('offers the reviewed source links without access tokens or auto-ingestion controls', () => {
    const { container } = render(<StudioResearchPage />);
    fireEvent.click(screen.getByText('Công cụ đã rà và lựa chọn cho EmBe'));
    for (const tool of researchTools) {
      const link = screen.getByRole('link', { name: tool.name, hidden: true });
      expect(link).toHaveAttribute('href', tool.url);
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.every(link => !/xsec_token|api_key|access_token|session=/i.test(link.href))).toBe(true);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
