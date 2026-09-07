import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { printedDate, proposeDocumentImport, providerKey, validImportDetails } from '../src/lib/medical-document-import';
import type { DocumentAnalysis, ExtractedField } from '../src/lib/medical-document-scan';
import type { MedicalRecord } from '../src/lib/pregnancy-medical';
import MedicalDocumentImport from '../src/components/medical-document-import';
import MedicalDocumentIntake from '../src/components/medical-document-intake';

const id = '11111111-1111-4111-8111-111111111111';
const linked = '22222222-2222-4222-8222-222222222222';
const field = (label: string, value: string, unit = '', unclear = false): ExtractedField => ({ label, value, unit, unclear, evidence: `${label} ${value} ${unit}`, reference: '' });
const sheet = (fields: ExtractedField[]): DocumentAnalysis => ({ version: 1, pages: [{ page: 1, kind: 'ultrasound', title: 'Siêu âm mẫu', fields, medicines: [], charges: [], warnings: [] }] });
const analysis = sheet([field('Họ tên', 'NGƯỜI MẪU'), field('Ngày khám', '07/09/2026'), field('Bệnh viện', 'Bệnh viện Mẫu'), field('CRL', '45,6', 'mm')]);
const record: MedicalRecord = { id: linked, title: 'Lần khám mẫu', kind: 'appointment', status: 'completed', occurredAt: '2026-09-07T02:00:00Z', provider: 'BV Mẫu', clinician: '', notes: '', gestationalWeek: null, nextAppointmentAt: null, measurements: {}, medicines: [], documents: [] };
const mock = vi.hoisted(() => ({ denied: false, calls: vi.fn(), upload: vi.fn() }));
vi.mock('../src/lib/medical-upload-client', () => ({ uploadDocument: (...args: unknown[]) => mock.upload(...args) }));
vi.mock('../src/lib/family-members-server', () => ({ memberAuthorization: vi.fn(async () => mock.denied ? new Response('', { status: 401 }) : null), memberBody: (r: Request) => r.json() }));
vi.mock('../src/lib/photo-upload-server', async () => ({ ...(await vi.importActual('../src/lib/photo-upload-server')), photoStore: () => ({ rpc: (...args: unknown[]) => ({ abortSignal: () => mock.calls(...args) }) }) }));
vi.mock('../src/lib/family-view-revalidation', () => ({ revalidateFamilyViews: vi.fn() }));
import { POST } from '../src/app/api/pregnancy/documents/[id]/import/route';
afterEach(() => { mock.denied = false; mock.calls.mockReset(); mock.upload.mockReset(); vi.unstubAllGlobals(); });

describe('safe medical import proposal', () => {
  it('reads Vietnamese administrative data and proposes one exact date/provider link', () => {
    const p = proposeDocumentImport(analysis, [record], id);
    expect(p.details).toMatchObject({ occurredOn: '2026-09-07', provider: 'BV Mẫu', linkedRecordId: linked, measurements: { crlMm: 45.6 } });
    expect(p.patients).toEqual(['NGƯỜI MẪU']); expect(validImportDetails(p.details)).toBe(true);
    expect(providerKey('Phòng khám Mẫu')).toBe(providerKey('PK Mẫu'));
  });
  it('does not match by date alone, pick a duplicate visit, or confuse birth date', () => {
    expect(proposeDocumentImport(sheet([field('Ngày sinh', '07/09/1996')]), [record], id).details.occurredOn).toBe('');
    expect(proposeDocumentImport(analysis, [record, { ...record, id: '33333333-3333-4333-8333-333333333333' }], id).details.linkedRecordId).toBeNull();
    expect(proposeDocumentImport(analysis, [{ ...record, provider: 'Nơi khác' }], id).details.linkedRecordId).toBeNull();
    expect(printedDate('31/02/2026')).toBe(''); expect(printedDate('09/07/26')).toBe('');
  });
  it('keeps unknown units, ranges, unclear and conflicting results out of numeric charts', () => {
    const p = proposeDocumentImport(sheet([field('CRL', '45,6', 'mm'), field('CRL', '46,6', 'mm'), field('NT', '< 2', 'mm'),
      field('FL', '18', 'cm'), field('BPD', '20', 'mm', true), field('glucose', '5,2', 'mmol/L')]), [], id);
    expect(p.details.measurements).toEqual({ glucoseMmoll: 5.2 });
  });
  it('requires medicine confirmation per row and never converts a dispensing quantity into dose', () => {
    const a = structuredClone(analysis);
    a.pages[0].medicines = [{ name: 'THUỐC MẪU', ingredients: '', dose: '', frequency: '', instructions: '', evidence: 'SL 30', unclear: true }];
    expect(proposeDocumentImport(a, [], id).details.medicines).toEqual([]);
    a.pages[0].medicines[0].unclear = false;
    expect(proposeDocumentImport(a, [], id).details.medicines[0].dose).toBe('');
  });
  it('rejects unknown keys/units and caller-controlled integration destinations', () => {
    const d = proposeDocumentImport(analysis, [], id).details;
    expect(validImportDetails({ ...d, url: 'https://example.com' })).toBe(false);
    expect(validImportDetails({ ...d, measurements: { guessedDose: 100 } })).toBe(false);
    expect(validImportDetails({ ...d, medicines: [{ name: 'x', dose: 12, frequency: '', instructions: '' }] })).toBe(false);
  });
});
it('requires authenticated explicit patient/review consent and passes both version fences', async () => {
  const details = proposeDocumentImport(analysis, [], id).details;
  const body = { analysis, details, revision: 3, recordUpdatedAt: '2026-09-07T00:00:00Z', confirmed: true, patientConfirmed: true };
  const request = (data = body) => new Request('https://embe.hieu.asia/api', { method: 'POST', body: JSON.stringify(data) });
  mock.denied = true; expect((await POST(request(), { params: Promise.resolve({ id }) })).status).toBe(401); expect(mock.calls).not.toHaveBeenCalled();
  mock.denied = false; expect((await POST(request({ ...body, patientConfirmed: false }), { params: Promise.resolve({ id }) })).status).toBe(400);
  mock.calls.mockResolvedValue({ data: { recordId: id, imported: true } });
  expect((await POST(request(), { params: Promise.resolve({ id }) })).status).toBe(200);
  expect(mock.calls).toHaveBeenCalledWith('embe_import_document', expect.objectContaining({ p_revision: 3, p_record_updated_at: body.recordUpdatedAt }));
  mock.calls.mockResolvedValue({ error: { code: 'PT409' } });
  expect((await POST(request(), { params: Promise.resolve({ id }) })).status).toBe(409);
});
it('shows the proposed link and imports only after confirmation, then shows a persistent destination', async () => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => Response.json(options?.method === 'POST' ? { recordId: id, imported: true }
    : { recordUpdatedAt: '2026-09-07T00:00:00Z', intake: true, imported: false, records: [record] }));
  vi.stubGlobal('fetch', fetcher);
  render(<MedicalDocumentImport documentId={id} recordId={id} revision={3} analysis={analysis} disabled={false} onImported={async () => {}} />);
  const button = await screen.findByRole('button', { name: 'Xác nhận & thêm vào hồ sơ' });
  expect(button).toBeDisabled(); expect(screen.getByLabelText('Liên kết lần khám')).toHaveValue(linked);
  fireEvent.click(screen.getByLabelText(/Đây là giấy tờ của Mẹ Ngân/)); fireEvent.click(button);
  await screen.findByText('Đã thêm dữ liệu vào hồ sơ');
  expect(fetcher.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(1);
});
it('offers camera and multi-file upload without a manual record form, retrying with the same identifiers', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id })));
  mock.upload.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ documentId: linked, mimeType: 'image/jpeg' });
  render(<MedicalDocumentIntake onSaved={() => {}} />);
  expect(screen.getByLabelText('Chụp giấy tờ khám')).toHaveAttribute('capture', 'environment');
  const file = new File(['synthetic'], 'sample.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText('Chọn giấy tờ khám'), { target: { files: [file] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
  await screen.findByRole('link', { name: 'Xem bản đọc' });
  await waitFor(() => expect(mock.upload).toHaveBeenCalledTimes(2));
  expect(mock.upload.mock.calls[0]).toEqual(mock.upload.mock.calls[1]);
});
