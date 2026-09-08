import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { validDocumentAnalysis, documentAnalysisText, editableDocumentAnalysis, withPrintedUnit, type DocumentAnalysis } from '../src/lib/medical-document-scan';
import MedicalDocumentReview from '../src/components/medical-document-review';

const mock = vi.hoisted(() => ({ denied: false, calls: vi.fn() }));
vi.mock('../src/lib/family-members-server', () => ({ memberAuthorization: vi.fn(async () => mock.denied ? new Response('', { status: 401 }) : null), memberBody: (request: Request) => request.json() }));
vi.mock('../src/lib/photo-upload-server', async () => ({ ...(await vi.importActual('../src/lib/photo-upload-server')), photoStore: () => ({ rpc: (...args: unknown[]) => ({ abortSignal: () => mock.calls(...args) }) }) }));
vi.mock('../src/lib/family-view-revalidation', () => ({ revalidateFamilyViews: vi.fn() }));
import { GET, POST, PATCH } from '../src/app/api/pregnancy/documents/[id]/scan/route';

const id = '11111111-1111-4111-8111-111111111111';
it.each([
  ['5 mg', 'g', '5 mg [Đơn vị ghi riêng: g; cần đối chiếu]'], ['45 mm', 'm', '45 mm [Đơn vị ghi riêng: m; cần đối chiếu]'],
  ['5mg', 'mg', '5mg'], ['45,6 mm', 'mm', '45,6 mm'],
  ['3', 'mmol/L', '3 mmol/L'], ['5 mL', 'ml', '5 mL [Đơn vị ghi riêng: ml; cần đối chiếu]'],
  ['âm tính', ' ', 'âm tính'], ['20 µg', 'g', '20 µg [Đơn vị ghi riêng: g; cần đối chiếu]']
])('preserves printed unit boundaries: %s / %s', (value, unit, expected) => {
  expect(withPrintedUnit(value, unit)).toBe(expected);
});
const context = { params: Promise.resolve({ id }) };
const analysis: DocumentAnalysis = { version: 1, pages: [{ page: 1, kind: 'ultrasound', title: 'Siêu âm mẫu',
  fields: [{ label: 'CRL', value: '45,6', unit: 'mm', reference: '', evidence: 'CRL 45,6 mm', unclear: true }], medicines: [], charges: [], warnings: [] }] };
const record = { documentId: id, recordId: id, filename: 'mau.pdf', mimeType: 'application/pdf', status: 'review', revision: 3, analysis, completedPages: 1, pageCount: 1 };
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
afterEach(() => {
  mock.denied = false; mock.calls.mockReset(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

describe('document recognition contract', () => {
  it('accepts independent local OCR alongside PDF source and excludes both from editable data', () => {
    const a = structuredClone(analysis);
    a.pages[0].pdfText = 'Nguồn PDF không thay đổi';
    a.pages[0].ocrText = 'Chữ OCR từ ảnh\nKhông phải dữ liệu đã xác nhận';
    a.pages[0].ocrEngine = 'tesseract-vie-eng';
    const original = structuredClone(a);
    expect(validDocumentAnalysis(a)).toBe(true);
    expect(editableDocumentAnalysis(a)).toEqual(analysis);
    expect(a).toEqual(original);
    for (const confirmed of [false, true]) {
      const copied = documentAnalysisText(a, confirmed);
      expect(copied).toContain('Nguồn PDF không thay đổi');
      expect(copied).toContain('OCR cục bộ (tesseract-vie-eng)');
      expect(copied).toContain('có thể sai chữ, số hoặc thứ tự; chưa được xác nhận');
      expect(copied).toContain(a.pages[0].ocrText);
    }
  });
  it.each([
    { ocrText: 'Chữ' }, { ocrEngine: 'tesseract-vie-eng' },
    { ocrText: 'Chữ', ocrEngine: 'model-generated' },
    { ocrText: null, ocrEngine: 'tesseract-vie-eng' },
    { ocrText: ['Chữ'], ocrEngine: 'tesseract-vie-eng' },
    { ocrText: 'Chữ', ocrEngine: null },
    { ocrText: 'Chữ', ocrEngine: 'tesseract-vie-eng', ocrConfidence: 1 },
    { ocrText: 'Chữ\u0001ẩn', ocrEngine: 'tesseract-vie-eng' }
  ])('rejects unpaired, untrusted or malformed OCR metadata (%#)', extra => {
    expect(validDocumentAnalysis({ ...analysis, pages: [{ ...analysis.pages[0], ...extra }] })).toBe(false);
  });
  it('bounds OCR by Unicode codepoints and permits empty paired output without claiming recognition', () => {
    const a = structuredClone(analysis);
    a.pages[0].ocrEngine = 'tesseract-vie-eng';
    a.pages[0].ocrText = '';
    expect(validDocumentAnalysis(a)).toBe(true);
    a.pages[0].ocrText = '𠀀'.repeat(48000);
    expect(validDocumentAnalysis(a)).toBe(true);
    a.pages[0].ocrText += 'a';
    expect(validDocumentAnalysis(a)).toBe(false);
  });
  it('keeps the 1.25 MB total source cap and the independent editable budget', () => {
    const a: DocumentAnalysis = { version: 1, pages: Array.from({ length: 6 }, (_, index) => ({
      ...structuredClone(analysis.pages[0]), page: index + 1,
      pdfText: 'x'.repeat(48000), ocrText: 'x'.repeat(48000), ocrEngine: 'tesseract-vie-eng'
    })) };
    expect(validDocumentAnalysis(a)).toBe(true);
    a.pages.forEach(page => { page.pdfText = 'ữ'.repeat(48000); page.ocrText = 'ữ'.repeat(48000); });
    expect(new TextEncoder().encode(JSON.stringify(a)).length).toBeGreaterThan(1_250_000);
    expect(validDocumentAnalysis(a)).toBe(false);
    a.pages = [a.pages[0]];
    a.pages[0].fields = Array.from({ length: 40 }, () => ({ ...analysis.pages[0].fields[0], value: 'x'.repeat(1600) }));
    expect(validDocumentAnalysis(a)).toBe(false);
  });
  it('accepts bounded original PDF text without expanding editable analysis', () => {
    const a = structuredClone(analysis);
    a.pages[0].pdfText = 'Nội dung chưa phân loại\n' + 'ữ'.repeat(47000);
    expect(validDocumentAnalysis(a)).toBe(true);
    expect(editableDocumentAnalysis(a)).toEqual(analysis);
    expect(a.pages[0].pdfText).toContain('Nội dung chưa phân loại');
    expect(documentAnalysisText(a)).toContain('Lớp chữ từ PDF — có thể sai');
    a.pages[0].pdfText = 'x'.repeat(48001); expect(validDocumentAnalysis(a)).toBe(false);
    a.pages[0].pdfText = 'x\u0001y'; expect(validDocumentAnalysis(a)).toBe(false);
  });
  it('accepts paired PDF source cells without weakening old scan validation', () => {
    const a = structuredClone(analysis);
    a.pages[0].fields[0].pdfValue = 'Sản';
    expect(validDocumentAnalysis(a)).toBe(false);
    a.pages[0].fields[0].pdfEvidence = 'Khoa: Sản';
    expect(validDocumentAnalysis(a)).toBe(true);
    expect(documentAnalysisText(a)).toContain('Chữ trong PDF khác bản nhập: Khoa: Sản');
    a.pages[0].fields[0].pdfEvidence = 'x'.repeat(1801);
    expect(validDocumentAnalysis(a)).toBe(false);
    const injected = structuredClone(analysis);
    injected.pages[0].medicines = [{ name: 'Mẫu', ingredients: '', dose: '', frequency: '', instructions: '', evidence: '', unclear: true, pdfValue: 'not allowed' } as never];
    expect(validDocumentAnalysis(injected)).toBe(false);
  });
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
  it('keeps uncertainty on copied drafts and confirmed transcriptions', () => {
    expect(documentAnalysisText(analysis)).toContain('Bản nháp');
    expect(documentAnalysisText(analysis)).toContain('45,6 mm [Cần kiểm tra lại với bản gốc]');
    expect(documentAnalysisText(analysis, true)).toContain('người dùng đối chiếu');
    expect(documentAnalysisText(analysis, true)).toContain('[Cần kiểm tra lại với bản gốc]');
  });
  it('supports old scans and all detailed columns without accepting unexpected model keys', () => {
    const a = structuredClone(analysis);
    a.pages[0].fields[0].context = 'Thai A';
    a.pages[0].medicines = [{ name: 'MẪU', ingredients: '', dose: '1 viên', frequency: '', instructions: '', route: 'uống', duration: '5 ngày', quantity: '10 viên', evidence: '', unclear: true }];
    a.pages[0].charges = [{ label: 'Dịch vụ', amount: '250.000', currency: 'VND', quantity: '2', unitPrice: '125.000', evidence: '', unclear: true }];
    expect(validDocumentAnalysis(a)).toBe(true);
    const text = documentAnalysisText(a);
    expect(text).toContain('Thai A'); expect(text).toContain('Đường dùng: uống'); expect(text).toContain('Số lượng cấp: 10 viên'); expect(text).toContain('Đơn giá: 125.000');
    a.pages[0].charges[0].unitPrice = 'x'.repeat(81); expect(validDocumentAnalysis(a)).toBe(false);
    a.pages[0].charges[0].unitPrice = '125.000';
    Object.assign(a.pages[0].charges[0], { hiddenUrl: 'https://example.com' }); expect(validDocumentAnalysis(a)).toBe(false);
  });
});

describe('document review UX', () => {
  it('links a multi-page overview to the correct source and keeps unsaved edits', async () => {
    const a = structuredClone(analysis);
    a.pages[0].fields.push({ label: 'Họ tên', value: 'Người mẫu A', unit: '', reference: '', evidence: 'Họ tên Người mẫu A', unclear: false });
    a.pages.push({ ...structuredClone(a.pages[0]), page: 2, title: 'Trang thứ hai', fields: [
      { label: 'Họ tên', value: 'Người mẫu B', unit: '', reference: '', evidence: 'Họ tên Người mẫu B', unclear: false },
      { label: 'CRL', value: '46,0', unit: 'mm', reference: '', context: 'Lần khám khác', evidence: 'CRL 46,0 mm', unclear: false }
    ] });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...record, analysis: a, completedPages: 2, pageCount: 2 })));
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    const { container } = render(<MedicalDocumentReview documentId={id} />);
    const overview = within(await screen.findByRole('region', { name: 'Tổng quan tài liệu' }));
    expect(overview.getByText(/Có nhiều tên người bệnh/)).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText('Tiêu đề')[0], { target: { value: 'Bản chưa lưu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ xem mục cần kiểm tra' }));
    expect(container.querySelectorAll('.document-row.needs-review')).toHaveLength(4);
    fireEvent.click(overview.getByText('2 điểm khác nhau cần đối chiếu'));
    fireEvent.click(overview.getAllByRole('button', { name: 'Đối chiếu CRL · trang 2' })[0]);
    await waitFor(() => expect(document.getElementById(`document-${id}-2:fields:1`)).toHaveAttribute('open'));
    const target = document.getElementById(`document-${id}-2:fields:1`)!;
    expect(target.querySelector('summary')).toHaveFocus();
    expect(scroll).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Chỉ xem mục cần kiểm tra' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByLabelText('Tiêu đề')[0]).toHaveValue('Bản chưa lưu');
    expect(within(target).getByLabelText('Nội dung / kết quả')).toHaveValue('46,0');
    expect(within(target).getByLabelText('Mục này vẫn cần kiểm tra lại')).not.toBeChecked();
    // A source jump neither confirms the document nor submits anything.
    expect(screen.getByRole('button', { name: 'Lưu bản đối chiếu' })).toBeDisabled();
  });
  it('updates derived comparisons when edited and escapes the summary content', async () => {
    const a = structuredClone(analysis);
    a.pages[0].fields = [{ label: 'Kết luận', value: '<img src=x onerror=alert(1)>', unit: '', reference: '', evidence: 'Mẫu', unclear: false, pdfValue: 'Nguyên văn', pdfEvidence: 'Kết luận: Nguyên văn' }];
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...record, analysis: a })));
    render(<MedicalDocumentReview documentId={id} />);
    const overview = await screen.findByRole('region', { name: 'Tổng quan tài liệu' });
    expect(overview.querySelector('img')).toBeNull();
    expect(within(overview).getByText('1 điểm khác nhau cần đối chiếu')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nội dung / kết quả'), { target: { value: 'Nguyên văn' } });
    expect(within(overview).queryByText('1 điểm khác nhau cần đối chiếu')).not.toBeInTheDocument();
    expect(within(overview).getByText('Nguyên văn')).toBeInTheDocument();
    expect(within(overview).getByText(/vẫn cần đối chiếu bản gốc/)).toBeInTheDocument();
  });
  it('shows read-only PDF text safely but never resubmits it as editable data', async () => {
    const a = structuredClone(analysis);
    a.pages[0].pdfText = 'Dòng chưa phân loại\n<script>sourceNotCode()</script>';
    const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => Response.json(options?.method === 'PATCH'
      ? { ...record, status: 'confirmed', revision: 4, analysis: a } : { ...record, analysis: a }));
    vi.stubGlobal('fetch', fetcher);
    render(<MedicalDocumentReview documentId={id} />);
    fireEvent.click(await screen.findByText('Chữ từ PDF · trang 1'));
    expect(await screen.findByLabelText('Lớp chữ PDF trang 1')).toHaveTextContent('<script>sourceNotCode()</script>');
    expect(screen.getByLabelText('Lớp chữ PDF trang 1').querySelector('script')).toBeNull();
    fireEvent.click(screen.getByLabelText('Tôi đã đối chiếu các trang với bản gốc'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đối chiếu' }));
    await screen.findByText('Đã lưu bản đối chiếu vào tài liệu này.');
    const sent = JSON.parse(String(fetcher.mock.calls.find(call => call[1]?.method === 'PATCH')?.[1]?.body));
    expect(sent.analysis.pages[0]).not.toHaveProperty('pdfText');
    expect(screen.getByLabelText('Lớp chữ PDF trang 1')).toHaveTextContent('Dòng chưa phân loại');
  });
  it('lets older prescription scans add missing structured details and persist them', async () => {
    const a = structuredClone(analysis);
    a.pages[0].medicines = [{ name: 'THUỐC MẪU', ingredients: '', dose: '', frequency: '', instructions: '', evidence: 'Chữ gốc', unclear: true }];
    const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => Response.json(options?.method === 'PATCH'
      ? { ...record, status: 'confirmed', revision: 4, analysis: JSON.parse(String(options.body)).analysis } : { ...record, analysis: a }));
    vi.stubGlobal('fetch', fetcher);
    render(<MedicalDocumentReview documentId={id} />);
    fireEvent.click(await screen.findByText('THUỐC MẪU', { selector: 'strong' }));
    fireEvent.change(screen.getByLabelText('Số lượng cấp phát (không phải liều)'), { target: { value: '10 viên' } });
    fireEvent.change(screen.getByLabelText('Đường dùng ghi trên đơn'), { target: { value: 'uống' } });
    fireEvent.click(screen.getByLabelText('Tôi đã đối chiếu các trang với bản gốc'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đối chiếu' }));
    await screen.findByText('Đã lưu bản đối chiếu vào tài liệu này.');
    const saved = JSON.parse(String(fetcher.mock.calls.find(call => call[1]?.method === 'PATCH')?.[1]?.body));
    expect(saved.analysis.pages[0].medicines[0]).toMatchObject({ quantity: '10 viên', route: 'uống', dose: '', evidence: 'Chữ gốc' });
  });
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
  it('keeps page edits while navigating and filtering a multi-page document', async () => {
    const pages = [analysis.pages[0], { ...analysis.pages[0], page: 2, title: 'Trang tiếp',
      fields: [{ ...analysis.pages[0].fields[0], label: 'NT', value: '1,2', unclear: false }] }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...record, pageCount: 2, analysis: { ...analysis, pages } }))));
    render(<MedicalDocumentReview documentId={id} />);
    await screen.findByText('CRL', { selector: 'strong' });
    fireEvent.change(screen.getAllByLabelText('Tiêu đề')[0], { target: { value: 'Bản sửa đang giữ' } });
    fireEvent.click(screen.getByRole('button', { name: /Trang 2/ }));
    expect(screen.getByText('CRL', { selector: 'strong' })).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ xem mục cần kiểm tra' }));
    expect(screen.getByText('NT', { selector: 'strong' })).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Trang 1/ }));
    expect(screen.getByText('CRL', { selector: 'strong' })).toBeVisible();
    expect(screen.getAllByLabelText('Tiêu đề')[0]).toHaveValue('Bản sửa đang giữ');
  });
  it('shows an authenticated original on demand with zoom and keyboard-accessible scroll', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...record, mimeType: 'image/jpeg' }))));
    render(<MedicalDocumentReview documentId={id} />);
    await screen.findByText('CRL', { selector: 'strong' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem bản gốc ngay tại đây' }));
    const image = screen.getByRole('img', { name: 'Bản gốc tài liệu để đối chiếu' });
    expect(image).toHaveAttribute('src', `/api/pregnancy/documents/${id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Phóng to bản gốc' }));
    expect(image).toHaveStyle({ width: '150%' });
    expect(screen.getByRole('region', { name: /Ảnh tài liệu gốc/ })).toHaveAttribute('tabindex', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Vừa khung bản gốc' }));
    expect(image).toHaveStyle({ width: '100%' });
  });
  it('does not discard a draft when the save response is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => new Response(JSON.stringify(options?.method === 'PATCH' ? {} : record))));
    render(<MedicalDocumentReview documentId={id} />);
    await screen.findByText('CRL', { selector: 'strong' });
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Cần giữ bản này' } });
    fireEvent.click(screen.getByLabelText('Tôi đã đối chiếu các trang với bản gốc'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đối chiếu' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('phản hồi lưu'));
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Cần giữ bản này');
  });
  it('shows the independent PDF wording, lets the user select it and preserves both source quotes', async () => {
    const sourceAnalysis = structuredClone(analysis);
    sourceAnalysis.pages[0].fields = [{ label: 'Khoa', value: 'Sán', unit: '', reference: '', evidence: 'Khoa: Sán',
      unclear: true, pdfValue: 'Sản', pdfEvidence: 'Khoa: Sản' }];
    const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => {
      if (options?.method === 'PATCH') return new Response(JSON.stringify({ ...record, status: 'confirmed', analysis: JSON.parse(String(options.body)).analysis }));
      return new Response(JSON.stringify({ ...record, analysis: sourceAnalysis }));
    });
    vi.stubGlobal('fetch', fetcher);
    render(<MedicalDocumentReview documentId={id} />);
    await screen.findByText('Khoa', { selector: 'strong' });
    fireEvent.click(screen.getByText('Khoa', { selector: 'strong' }));
    expect(screen.getByLabelText('Nội dung / kết quả')).toHaveValue('Sán');
    expect(screen.getByText('Chữ lấy trực tiếp từ PDF')).toBeVisible();
    expect(screen.queryByLabelText('pdfValue')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dùng chữ từ PDF cho mục này' }));
    expect(screen.getByLabelText('Nội dung / kết quả')).toHaveValue('Sản');
    expect(screen.getByLabelText('Mục này vẫn cần kiểm tra lại')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Tôi đã đối chiếu các trang với bản gốc'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đối chiếu' }));
    await screen.findByText('Đã lưu bản đối chiếu vào tài liệu này.');
    const saved = JSON.parse(String(fetcher.mock.calls.find(call => call[1]?.method === 'PATCH')?.[1]?.body));
    expect(saved.analysis.pages[0].fields[0]).toMatchObject({ value: 'Sản', evidence: 'Khoa: Sán', pdfValue: 'Sản', pdfEvidence: 'Khoa: Sản', unclear: true });
  });
});
