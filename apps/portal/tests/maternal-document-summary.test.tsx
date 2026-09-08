import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MaternalDocumentSummary from '../src/components/maternal-document-summary';
vi.mock('../src/lib/use-family-data-refresh', () => ({ useFamilyDataRefresh: vi.fn() }));
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it('automatically requests safe profile sync and shows source fields without downloading images', async () => {
  const analysis = {version:1,pages:[{page:1,kind:'other',title:'Phiếu khám',fields:[{label:'Lời dặn',value:'Tái khám theo hẹn',unit:'',reference:'',evidence:'Tái khám theo hẹn',unclear:false}],medicines:[],charges:[],warnings:[]}]};
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/pregnancy/records'
    ? {records:[{documents:[{id:'one'},{id:'two'},{id:'one'}]}]}
    : url.endsWith('/sync-maternal') ? {added:[],conflicts:[],skipped:1}
    : url.endsWith('/one/scan') ? {documentId:'one',status:'review',analysis}
    : {documentId:'two',status:'processing',analysis:null}), {status:200}));
  vi.stubGlobal('fetch',fetcher);
  render(<MaternalDocumentSummary />);
  await screen.findByText('Tái khám theo hẹn');
  expect(screen.getByText(/1\/2 tài liệu có bản đọc/)).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(4);
  for (const [url, options] of fetcher.mock.calls as unknown as [string, RequestInit][]) expect(options.method).toBe(url.endsWith('/sync-maternal') ? 'POST' : undefined);
  expect(document.querySelector('img')).toBeNull();
  expect(document.querySelectorAll('details[open]')).toHaveLength(0);
});
it('reports unavailable data instead of an empty healthy profile', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}',{status:503})));
  render(<MaternalDocumentSummary />);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Chưa cập nhật'));
  expect(screen.queryByText(/0\/0/)).toBeNull();
});
