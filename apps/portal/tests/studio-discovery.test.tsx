import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { cleanReferenceUrl, discoveryKey, editorialBrief, mergeBoard, niches, parseTrendFeed, searchLinks, validateBoard, velocity, type DiscoveryItem } from '../src/lib/studio-discovery';
import StudioDiscovery from '../src/components/studio-discovery';
const fixture = vi.hoisted(() => ({ denied: false }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock('../src/lib/family-members-server', () => ({ memberAuthorization: async () => fixture.denied ? new Response('Unauthorized', { status: 401 }) : null }));
import { GET } from '../src/app/api/studio/discovery/route';

const xml = '<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title>mẹ bầu</title><pubDate>Mon, 7 Sep 2026 05:30:00 -0700</pubDate><ht:approx_traffic>1000+</ht:approx_traffic><description>&lt;script&gt;alert(1)&lt;/script&gt;</description></item><item><title>bóng đá</title><ht:approx_traffic>500+</ht:approx_traffic></item></channel></rss>';
const makeItem = (): DiscoveryItem => ({ id: 'test-1', title: 'Bữa nhỏ', url: 'https://rednote.com/discovery/item/123', niche: 'food', note: 'Minh họa gốc', status: 'saved', snapshots: [] });
beforeEach(() => { localStorage.clear(); fixture.denied = false; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Discovery metadata safety and truthful metrics', () => {
  it('strips access/tracking tokens and deduplicates XHS aliases', () => {
    expect(cleanReferenceUrl('https://www.xiaohongshu.com/explore/123?xsec_token=SECRET&xsec_source=pc#share')).toBe('https://rednote.com/discovery/item/123');
    expect(cleanReferenceUrl('https://www.youtube.com/watch?v=abc&token=SECRET')).toBe('https://youtube.com/watch?v=abc');
  });
  it.each(['javascript:alert(1)', 'https://tiktok.com.evil.test/v', 'https://u:p@rednote.com/p', 'http://rednote.com/x', 'https://127.0.0.1', 'https://rednote.com:444/x'])('rejects unsafe link %s', link => expect(() => cleanReferenceUrl(link)).toThrow());
  it('rejects duplicate links, bad types, negative counts, future clocks and excessive boards', () => {
    const item = makeItem(); expect(() => validateBoard([item, { ...item, id: 'two' }])).toThrow();
    expect(() => validateBoard([{ ...item, note: {} }])).toThrow();
    expect(() => validateBoard(Array(201).fill(item))).toThrow();
    expect(() => validateBoard([{ ...item, snapshots: [{ at: '2025-01-01T00:00:00Z', likes: -1, saves: null, shares: null }] }])).toThrow();
    expect(() => validateBoard([{ ...item, snapshots: [{ at: '2099-01-01T00:00:00Z', likes: 1, saves: null, shares: null }] }])).toThrow();
  });
  it('merges without overwriting existing notes or colliding source IDs', () => {
    const item = makeItem(); const result = mergeBoard([item], [{ ...item, note: 'replace' }, { ...item, url: 'https://youtube.com/watch?v=2' }]);
    expect(result).toHaveLength(2); expect(result[0].note).toBe(item.note); expect(result[0].id).not.toBe(result[1].id);
  });
  it('requires observations, treats missing metrics as unknown and handles counter resets', () => {
    const item = makeItem(); expect(velocity(item).value).toBeNull();
    const now = Date.now(); const at = (hours: number) => new Date(now - hours * 3600000).toISOString();
    item.snapshots = [{ at: at(3), likes: 10, saves: null, shares: null }, { at: at(1), likes: 30, saves: 999, shares: null }];
    expect(velocity(item, now).value).toBe(10); expect(velocity(item, now).label).not.toContain('lưu');
    expect(velocity(item, now + 50 * 3600000).value).toBeNull();
    item.snapshots[1].likes = 1; expect(velocity(item, now).label).toContain('Số đếm giảm');
    item.snapshots[1].at = at(2.9); expect(velocity(item, now).value).toBeNull();
  });
  it('parses namespace metrics without injecting HTML or inventing dates', () => {
    const items = parseTrendFeed(xml); expect(items).toHaveLength(2); expect(items[0]).toMatchObject({ relevant: true, volume: '1000+' }); expect(items[1].relevant).toBe(false); expect(items[1].startedAt).toBeNull();
    expect(JSON.stringify(items)).not.toContain('script');
    expect(() => parseTrendFeed('<!DOCTYPE rss><rss/>')).toThrow(); expect(() => parseTrendFeed('<rss>')).toThrow();
  });
  it('builds encoded multilingual searches and an explicitly unreviewed editorial draft', () => {
    expect(niches).toHaveLength(10); const links = searchLinks(niches[0], 'zh'); expect(links).toHaveLength(7); expect(decodeURIComponent(links[0].url)).toContain(niches[0].zh);
    expect(searchLinks(niches[0], 'vi', '&foo=<x>')[0].url).toContain('%26foo%3D%3Cx%3E');
    expect(editorialBrief(makeItem())).toContain('không phải kiến thức đã được kiểm chứng');
  });
});

describe('Read-only trend collector boundary', () => {
  const request = () => new Request('https://embe.hieu.asia/api/studio/discovery?url=http://127.0.0.1', { headers: { cookie: 'secret-private-cookie' } });
  it('denies sessions before any network call', async () => {
    fixture.denied = true; const network = vi.spyOn(globalThis, 'fetch'); expect((await GET(request())).status).toBe(401); expect(network).not.toHaveBeenCalled();
  });
  it('only fetches the fixed public source and keeps auth outside shared cache', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(xml, { headers: { 'content-type': 'text/xml' } }));
    const response = await GET(request()); const data = await response.json(); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(data.status).toBe('ready'); expect(data.xml).toContain('<rss'); expect(Date.parse(data.checkedAt)).toBeGreaterThan(0);
    expect(network.mock.calls[0][0]).toBe('https://trends.google.com/trending/rss?geo=VN'); expect(network.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(JSON.stringify(network.mock.calls)).not.toContain('secret-private-cookie');
  });
  it.each([['rate-limit', '', 429, 'text/xml'], ['html', '<html>Login</html>', 200, 'text/html'], ['entities', '<!DOCTYPE rss><rss/>', 200, 'text/xml'], ['too-large', '<rss>' + 'x'.repeat(1000001), 200, 'text/xml']])('fails safely for %s', async (_, body, status, contentType) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: Number(status), headers: { 'content-type': String(contentType) } }));
    const response = await GET(request()); expect(response.status).toBe(503); expect(response.headers.get('retry-after')).toBe('900'); expect((await response.json()).xml).toBe('');
  });
  it('turns connection failure into a recoverable state', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network')); expect((await GET(request())).status).toBe(503);
  });
});

describe('Discovery mobile workflow', () => {
  function setup() { vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'ready', checkedAt: new Date().toISOString(), xml }))); return render(<StudioDiscovery />); }
  it('saves canonical sources, prevents duplicates, edits, reloads and undoes deletion', async () => {
    const view = setup(); fireEvent.click(screen.getByText('Những mẫu Rednote đã xem'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Lưu mẫu này' })[0]); expect(JSON.parse(localStorage.getItem(discoveryKey)!)).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Lưu mẫu này' })[0]); expect(screen.getByText('Liên kết này đã có trong sổ.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sửa ý tưởng & ghi số liệu')); fireEvent.change(screen.getByDisplayValue('Cách trình bày dòng thời gian thai kỳ'), { target: { value: 'Ý tưởng riêng' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(JSON.parse(localStorage.getItem(discoveryKey)!)[0].title).toBe('Ý tưởng riêng');
    view.unmount(); setup(); expect(screen.getByRole('link', { name: 'Ý tưởng riêng' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sửa ý tưởng & ghi số liệu')); fireEvent.click(screen.getByRole('button', { name: 'Xóa ý tưởng' })); expect(JSON.parse(localStorage.getItem(discoveryKey)!)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác xóa' })); expect(JSON.parse(localStorage.getItem(discoveryKey)!)[0].title).toBe('Ý tưởng riêng');
    await waitFor(() => expect(screen.getByText('Đã lấy tín hiệu từ Google Trends Việt Nam.')).toBeInTheDocument());
  });
  it('does not silently reset a corrupt board or fabricate trending posts', async () => {
    localStorage.setItem(discoveryKey, '{broken'); setup(); expect(screen.getByText(/Không đọc được sổ/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Những mẫu Rednote đã xem')); expect(screen.getAllByRole('button', { name: 'Lưu mẫu này' })[0]).toBeDisabled(); expect(localStorage.getItem(discoveryKey)).toBe('{broken');
    await waitFor(() => expect(screen.getByText(/Đã lấy tín hiệu/)).toBeInTheDocument());
  });
  it('preserves form content when storage write fails', () => {
    setup(); fireEvent.click(screen.getByText('Thêm bài viết, video hoặc kênh')); fireEvent.change(screen.getByLabelText('Tên ý tưởng'), { target: { value: 'Giữ bản nháp' } }); fireEvent.change(screen.getByLabelText('Liên kết gốc'), { target: { value: 'https://rednote.com/discovery/item/123' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ý tưởng' })); expect(screen.getByLabelText('Tên ý tưởng')).toHaveValue('Giữ bản nháp'); expect(screen.getByText(/Chưa lưu được trên máy/)).toBeInTheDocument();
  });
  it('filters unrelated trends and labels missing evidence', async () => {
    setup(); await waitFor(() => expect(screen.getByText(/Đã lấy tín hiệu/)).toBeInTheDocument()); fireEvent.click(screen.getByText(/Tín hiệu mới tại Việt Nam/));
    expect(screen.getByRole('link', { name: 'mẹ bầu' })).toBeInTheDocument(); expect(screen.queryByRole('link', { name: 'bóng đá' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Xem xu hướng chung' })); expect(screen.getByRole('link', { name: 'bóng đá' })).toBeInTheDocument();
    expect(screen.getByText(/chưa tự đồng bộ hai điện thoại/)).toBeInTheDocument();
  });
});
