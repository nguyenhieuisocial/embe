import { StrictMode } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MedicalDocumentButton from '../src/components/medical-document-viewer';
import MedicalDocumentReview from '../src/components/medical-document-review';

const image = { id: '11111111-1111-4111-8111-111111111111', originalFilename: 'Siêu âm.png', mimeType: 'image/png' };
const pdf = { id: '22222222-2222-4222-8222-222222222222', originalFilename: 'Hồ sơ.pdf', mimeType: 'application/pdf' };
const createUrl = vi.fn(() => 'blob:private-document');
const revokeUrl = vi.fn();
const reply = (mime = 'image/png') => ({ ok: true, status: 200, blob: async () => new Blob(['synthetic'], { type: mime }) }) as Response;
beforeEach(() => {
  window.history.replaceState({ routeMarker: 'preserve' }, '', '/me-bau/ho-so#ho-so-kham');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); }) });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); }) });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => reply()));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); createUrl.mockClear(); revokeUrl.mockClear(); window.history.replaceState({}, '', '/'); });

async function open() {
  const trigger = screen.getByRole('button', { name: /Ảnh · Siêu âm/ }); trigger.focus(); fireEvent.click(trigger);
  await screen.findByRole('img', { name: image.originalFilename }); return trigger;
}

describe('private medical original viewer', () => {
  it('uses the same viewer but a member-bound endpoint for general health documents', async () => {
    render(<MedicalDocumentButton document={image} familyScope={{ memberId: pdf.id, recordId: image.id }} />);
    await open();
    expect(fetch).toHaveBeenCalledWith(`/api/family/members/${pdf.id}/records/${image.id}/documents/${image.id}`, expect.objectContaining({ cache: 'no-store' }));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/pregnancy/'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Quay lại hồ sơ' })).toBeEnabled();
  });
  it('opens inside the app, zooms/rotates, closes and restores the exact scroll and trigger focus', async () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(812);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<MedicalDocumentButton document={image} />);
    const trigger = await open();
    expect(location.pathname + location.hash).toBe('/me-bau/ho-so#ho-so-kham');
    expect(window.history.state.routeMarker).toBe('preserve');
    expect(window.history.state.embeMedicalViewer).toBeTruthy();
    screen.getByRole('button', { name: 'Quay lại hồ sơ' }).focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Quay lại hồ sơ' })).toHaveFocus();
    expect(document.body.style.position).toBe('fixed');
    expect(fetch).toHaveBeenCalledWith(`/api/pregnancy/documents/${image.id}`, expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
    // Pointer capture can retarget the double-tap to the stage rather than the image.
    fireEvent.doubleClick(screen.getByRole('region', { name: 'Ảnh, phóng to và kéo để xem' }));
    expect(screen.getByRole('img')).toHaveStyle({ transform: 'translate3d(0px, 0px, 0) scale(2)' });
    fireEvent.doubleClick(screen.getByRole('region', { name: 'Ảnh, phóng to và kéo để xem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Phóng to ảnh' }));
    expect(screen.getByRole('img')).toHaveStyle({ transform: 'translate3d(0px, 0px, 0) scale(1.5)' });
    fireEvent.click(screen.getByRole('button', { name: 'Xoay ảnh' }));
    expect(screen.getByRole('img')).toHaveStyle({ transform: 'translate3d(0px, 0px, 0) rotate(90deg) scale(1)' });
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại hồ sơ' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.position).toBe('');
    expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 812, behavior: 'instant' });
    expect(trigger).toHaveFocus(); expect(revokeUrl).toHaveBeenCalledWith('blob:private-document');
  });
  it('handles browser Back and StrictMode without extra history entries or leaving the page', async () => {
    const push = vi.spyOn(window.history, 'pushState'); const back = vi.spyOn(window.history, 'back');
    render(<StrictMode><MedicalDocumentButton document={image} /></StrictMode>); await open();
    expect(push).toHaveBeenCalledTimes(1); expect(window.history.state.embeMedicalViewer).toBeTruthy();
    window.history.replaceState({ routeMarker: 'preserve' }, '', location.href);
    fireEvent.popState(window, { state: window.history.state });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(back).not.toHaveBeenCalled();
  });
  it('changes documents without pushing another history entry, releases blobs and contains PDF inside the dialog', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => reply(String(url).endsWith(pdf.id) ? 'application/pdf' : 'image/png')));
    const push = vi.spyOn(window.history, 'pushState');
    render(<MedicalDocumentButton document={image} documents={[image, pdf]} />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Sau ›' }));
    await screen.findByTitle(`PDF · ${pdf.originalFilename}`);
    expect(screen.getByTitle(`PDF · ${pdf.originalFilename}`)).toHaveAttribute('src', 'blob:private-document#page=1');
    expect(push).toHaveBeenCalledTimes(1); expect(revokeUrl).toHaveBeenCalledWith('blob:private-document');
    expect(screen.queryByRole('button', { name: 'Phóng to ảnh' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '‹ Trước' })); await screen.findByRole('img');
  });
  it('offers retry and an always-available exit when offline, then supports native Escape/cancel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(async () => reply()));
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<MedicalDocumentButton document={image} />);
    fireEvent.click(screen.getByRole('button', { name: /Ảnh ·/ }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Quay lại hồ sơ' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' })); await screen.findByRole('img');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(back).toHaveBeenCalledOnce();
  });
  it('aborts pending loads when closed and never displays an HTML login response as a file', async () => {
    let signal: AbortSignal;
    vi.stubGlobal('fetch', vi.fn((_url, options) => { signal = options.signal; return new Promise(() => {}); }));
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<MedicalDocumentButton document={image} />);
    fireEvent.click(screen.getByRole('button', { name: /Ảnh ·/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(signal!.aborted).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => reply('text/html')));
    fireEvent.click(screen.getByRole('button', { name: /Ảnh ·/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('File chưa đúng định dạng');
    expect(createUrl).not.toHaveBeenCalled();
  });
  it('shares an already prepared private file within the click, not an inaccessible or public URL', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    render(<MedicalDocumentButton document={image} />); await open();
    const requests = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ / lưu ảnh' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].files[0].name).toBe(image.originalFilename);
    expect(share.mock.calls[0][0]).not.toHaveProperty('url');
    expect(vi.mocked(fetch).mock.calls.length).toBe(requests);
    await screen.findByText('Đã chuyển file sang bảng chia sẻ.');
  });
  it('downloads original bytes using the original filename without navigating to a raw API URL', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<MedicalDocumentButton document={image} />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Tải xuống' }));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(image.originalFilename); expect(anchor.href).toBe('blob:private-document');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('keeps unsaved transcription edits when opening and closing the original', async () => {
    const record = { documentId: image.id, recordId: image.id, filename: image.originalFilename, mimeType: image.mimeType, status: 'review', revision: 1,
      analysis: { version: 1, pages: [{ page: 1, kind: 'ultrasound', title: 'Bản đọc', fields: [], medicines: [], charges: [], warnings: [] }] } };
    vi.stubGlobal('fetch', vi.fn(async url => String(url).endsWith('/scan') || String(url).endsWith('/import') ? Response.json(record) : reply()));
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<MedicalDocumentReview documentId={image.id} />);
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), { target: { value: 'Đang sửa, chưa lưu' } });
    fireEvent.click(screen.getByRole('button', { name: /Xem toàn màn hình/ }));
    await within(screen.getByRole('dialog')).findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Đang sửa, chưa lưu'));
    expect(screen.getByText('Có thay đổi chưa lưu.')).toBeInTheDocument();
  });
});
