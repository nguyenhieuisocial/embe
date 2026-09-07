import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { validDocumentAnalysis, type DocumentAnalysis } from '../src/lib/medical-document-scan';
import MedicalDocumentReview from '../src/components/medical-document-review';

const mock = vi.hoisted(() => ({ denied: false, calls: vi.fn() }));
vi.mock('../src/lib/family-members-server', () => ({ memberAuthorization: vi.fn(async () => mock.denied ? new Response('', { status: 401 }) : null), memberBody: (request: Request) => request.json() }));
vi.mock('../src/lib/photo-upload-server', async () => ({ ...(await vi.importActual('../src/lib/photo-upload-server')), photoStore: () => ({ rpc: (...args: unknown[]) => ({ abortSignal: () => mock.calls(...args) }) }) }));
vi.mock('../src/lib/family-view-revalidation', () => ({ revalidateFamilyViews: vi.fn() }));
import { GET, POST, PATCH } from '../src/app/api/pregnancy/documents/[id]/scan/route';

const id = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ id }) };
const analysis: DocumentAnalysis = { version: 1, pages: [{ page: 1, kind: 'ultrasound', title: 'Siêu âm mẫu',
  fields: [{ label: 'CRL', value: '45,6', unit: 'mm', reference: '', evidence: 'CRL 45,6 mm', unclear: true }], medicines: [], charges: [], warnings: [] }] };
const record = { documentId: id, recordId: id, filename: 'mau.pdf', mimeType: 'application/pdf', status: 'review', revision: 3, analysis, completedPages: 1, pageCount: 1 };
afterEach(() => { mock.denied = false; mock.calls.mockReset(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('document recognition contract', () => {
  it('preserves decimal text and rejects missing pages or unexpected fields', () => {
    expect(validDocumentAnalysis(analysis)).toBe(true);
    expect(validDocumentAnalysis({ ...analysis, pages: [{ ...analysis.pages[0], page: 2 }] })).toBe(false);
    expect(validDocumentAnalysis({ ...analysis, diagnosis: 'new advice' })).toBe(false);
    expect(validDocumentAnalysis({ ...analysis, pages: [{ ...analysis.pages[0], fields: [{ ...analysis.pages[0].fields[0], value: 45.6 }] }] })).toBe(false);
  });
  it('requires authentication and explicit review, passes version fence', async () => {
    mock.denied = true;
    expect((await GET(new Request('https://embe.hieu.asia/api'), context)).status).toBe(401);
    expect(mock.calls).not.toHaveBeenCalled();
    mock.denied = false;
    const req = (value: unknown) => new Request('https://embe.hieu.asia/api', { method: 'PATCH', body: JSON.stringify(value) });
    expect((await PATCH(req({ revision: 3, analysis, confirmed: false }), context)).status).toBe(400);
    mock.calls.mockResolvedValue({ data: { ...record, status: 'confirmed', revision: 4 }, error: null });
    expect((await PATCH(req({ revision: 3, analysis, confirmed: true }), context)).status).toBe(200);
    expect(mock.calls).toHaveBeenCalledWith('embe_confirm_document_scan', { p_document_id: id, p_revision: 3, p_analysis: analysis });
    mock.calls.mockResolvedValue({ error: { code: '40001' } });
    expect((await PATCH(req({ revision: 3, analysis, confirmed: true }), context)).status).toBe(409);
    mock.calls.mockResolvedValue({ error: { code: 'PT409' } });
    expect((await PATCH(req({ revision: 3, analysis, confirmed: true }), context)).status).toBe(409);
    mock.calls.mockResolvedValue({ error: { code: 'PT404' } });
    expect((await PATCH(req({ revision: 3, analysis, confirmed: true }), context)).status).toBe(404);
  });
  it('never accepts caller-supplied provider URLs or model commands', async () => {
    const request = new Request('https://embe.hieu.asia/api', { method: 'POST', body: JSON.stringify({ url: 'http://example.com' }) });
    expect((await POST(request, context)).status).toBe(400);
    expect(mock.calls).not.toHaveBeenCalled();
  });
});

describe('document review UX', () => {
  it('lets user correct, add and confirm without changing printed evidence', async () => {
    const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => new Response(JSON.stringify(options?.method === 'PATCH'
      ? { ...record, status: 'confirmed', revision: 4, analysis: JSON.parse(String(options.body)).analysis } : record)));
    vi.stubGlobal('fetch', fetcher);
    render(<MedicalDocumentReview documentId={id} />);
    await screen.findByText('CRL', { selector: 'strong' });
    expect(screen.getByRole('button', { name: 'Lưu bản đối chiếu' })).toBeDisabled();
    fireEvent.click(screen.getByText('CRL', { selector: 'strong' }));
    fireEvent.change(screen.getByLabelText('Nội dung / kết quả'), { target: { value: '46,1' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm thông tin còn thiếu/ }));
    expect(screen.getByText('Mục mới')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Tôi đã đối chiếu các trang với bản gốc'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đối chiếu' }));
    await screen.findByText('Đã lưu bản đối chiếu vào tài liệu này.');
    const saved = JSON.parse(String(fetcher.mock.calls.find(call => call[1]?.method === 'PATCH')?.[1]?.body));
    expect(saved.analysis.pages[0].fields[0].value).toBe('46,1');
    expect(saved.analysis.pages[0].fields[0].evidence).toBe('CRL 45,6 mm');
  });
  it('keeps edits on conflict and does not retry overwriting', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => options?.method === 'PATCH'
      ? new Response('{}', { status: 409 }) : new Response(JSON.stringify(record))));
    render(<MedicalDocumentReview documentId={id} />);
    await screen.findByText('CRL', { selector: 'strong' });
    fireEvent.click(screen.getByText('CRL', { selector: 'strong' }));
    fireEvent.change(screen.getByLabelText('Nội dung / kết quả'), { target: { value: '46,1' } });
    fireEvent.click(screen.getByLabelText('Tôi đã đối chiếu các trang với bản gốc'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đối chiếu' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('thiết bị khác'));
    expect(screen.getByLabelText('Nội dung / kết quả')).toHaveValue('46,1');
    expect(screen.getByRole('button', { name: 'Lưu bản đối chiếu' })).toBeDisabled();
  });
});
