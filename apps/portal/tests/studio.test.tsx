import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';
import StudioCollection from '../src/components/studio-collection';
import StudioActions from '../src/components/studio-actions';
import StudioPlayer from '../src/components/studio-player';

const fixture = vi.hoisted(() => ({ denied: false }));
vi.mock('../src/lib/family-members-server', () => ({ memberAuthorization: vi.fn(async () => fixture.denied ? new Response('Unauthorized', { status: 401 }) : null) }));
vi.mock('../src/lib/studio', async () => {
  const body = new Uint8Array([1, 2, 3, 4]);
  const { createHash } = await import('node:crypto');
  return {
    studioTopic: (slug: string) => slug === 'an-ca' ? { slug } : undefined,
    studioAsset: () => ({ path: `editorial/${'a'.repeat(64)}.mp4`, mime: 'video/mp4', size: body.length, checksum: createHash('sha256').update(body).digest('hex') }),
    studioScript: () => 'Kịch bản nháp', studioSubtitles: () => 'WEBVTT\n\n'
  };
});
import { GET } from '../src/app/api/studio/[slug]/[kind]/route';

const context = (kind = 'video', slug = 'an-ca') => ({ params: Promise.resolve({ slug, kind }) });
afterEach(() => { fixture.denied = false; vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Studio content and controls', () => {
  it('distinguishes narrated videos from silent drafts without autoplay', () => {
    render(<StudioCollection topics={[
      { slug: 'co-giong', title: 'Bữa nhỏ', pillar: 'Ăn uống', stage: 'Thai kỳ', duration: 30, audio: true },
      { slug: 'khong-giong', title: 'Ăn cá', pillar: 'Ăn uống', stage: 'Thai kỳ', duration: 30 }
    ]} ideas={[]} />);
    expect(screen.getByRole('link', { name: /Bữa nhỏ/ })).toHaveTextContent('Có giọng đọc AI');
    expect(screen.getByRole('link', { name: /Ăn cá/ })).toHaveTextContent('Chưa có giọng đọc');
    const { container } = render(<StudioPlayer slug="co-giong" title="Bữa nhỏ" audio />);
    expect(screen.getByText(/Có giọng đọc AI tiếng Việt/)).toBeInTheDocument();
    expect(container.querySelector('video')).not.toHaveAttribute('autoplay');
    expect(container.querySelector('video')).toHaveAttribute('playsinline');
  });
  it('searches without Vietnamese accents and separates unreviewed ideas', () => {
    render(<StudioCollection topics={[{ slug: 'an-ca', title: 'Có bầu ăn cá được không?', pillar: 'Ăn uống', stage: 'Thai kỳ', duration: 30 }]} ideas={['Ở cữ có cần nằm than?']} />);
    fireEvent.change(screen.getByLabelText('Tìm chủ đề'), { target: { value: 'an ca' } });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/studio/an-ca');
    fireEvent.change(screen.getByLabelText('Tìm chủ đề'), { target: { value: 'khong thay' } });
    expect(screen.getByText('Chưa có chủ đề khớp với tìm kiếm này.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ý tưởng 1' }));
    expect(screen.getByText('Ở cữ có cần nằm than?')).toBeInTheDocument();
    expect(screen.getByText(/chưa phải kiến thức đã kiểm chứng/)).toBeInTheDocument();
  });
  it('copies the requested content and offers authenticated same-origin downloads', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<StudioActions slug="an-ca" script="Kịch bản" caption="Caption" />);
    fireEvent.click(screen.getByRole('button', { name: 'Chép caption' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Caption'));
    expect(screen.getByRole('link', { name: 'Tải video' })).toHaveAttribute('href', '/api/studio/an-ca/video?download=1');
    await waitFor(() => expect(screen.getByText('Đã chép caption.')).toBeInTheDocument());
  });
});

describe('Studio authenticated downloads and Safari ranges', () => {
  function upstream() {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('SUPABASE_SECRET_KEY', 'server-only');
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'video/mp4' } }));
  }
  it('denies revoked or missing sessions before accessing storage', async () => {
    fixture.denied = true; const network = upstream();
    expect((await GET(new Request('https://embe.hieu.asia/api/studio/an-ca/video'), context())).status).toBe(401);
    expect(network).not.toHaveBeenCalled();
  });
  it.each([['bytes=0-1', 1, 2], ['bytes=-2', 3, 4], ['bytes=2-', 3, 4]])('supports %s even when storage returns a complete file', async (range, first, last) => {
    const network = upstream();
    const response = await GET(new Request('https://embe.hieu.asia/api/studio/an-ca/video', { headers: { range } }), context());
    expect(response.status).toBe(206); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([first, last]);
    expect(network.mock.calls[0][0]).not.toContain('server-only');
    expect(response.headers.get('location')).toBeNull();
  });
  it('rejects multi-ranges, traversal and bad checksums', async () => {
    const network = upstream();
    const response = await GET(new Request('https://embe.hieu.asia/api/studio/an-ca/video', { headers: { range: 'bytes=0-1,2-3' } }), context());
    expect(response.status).toBe(416); expect(network).not.toHaveBeenCalled();
    expect((await GET(new Request('https://embe.hieu.asia/api/studio/test/video'), context('video', '../private'))).status).toBe(404);
    network.mockResolvedValueOnce(new Response(new Uint8Array([4, 3, 2, 1]), { headers: { 'content-type': 'video/mp4' } }));
    expect((await GET(new Request('https://embe.hieu.asia/api/studio/an-ca/video'), context())).status).toBe(503);
  });
  it('downloads scripts without querying storage and sends a full video after If-Range mismatch', async () => {
    const network = upstream();
    const response = await GET(new Request('https://embe.hieu.asia/api/studio/an-ca/script?download=1'), context('script'));
    expect(await response.text()).toBe('Kịch bản nháp'); expect(network).not.toHaveBeenCalled();
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const video = await GET(new Request('https://embe.hieu.asia/api/studio/an-ca/video', { headers: { range: 'bytes=0-1', 'if-range': '"old"' } }), context());
    expect(video.status).toBe(200); expect(video.headers.get('etag')).toContain(createHash('sha256').update(new Uint8Array([1, 2, 3, 4])).digest('hex'));
  });
});
