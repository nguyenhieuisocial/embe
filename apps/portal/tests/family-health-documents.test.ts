// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createSessionCookie } from '../src/lib/portal-auth';
import { validDocumentMetadata, publicDocument } from '../src/lib/family-health-documents';
import { listFamilyDocuments, createFamilyDocument, readFamilyDocument, changeFamilyDocument } from '../src/lib/family-health-documents-server';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), state: vi.fn(), info: vi.fn(), download: vi.fn(), sign: vi.fn() }));
vi.mock('../src/lib/session-store', () => ({ activeSessionState: mocks.state }));
vi.mock('../src/lib/family-members-server', async original => ({ ...await original<typeof import('../src/lib/family-members-server')>(), memberRpc: mocks.rpc }));
vi.mock('../src/lib/photo-upload-server', async original => ({ ...await original<typeof import('../src/lib/photo-upload-server')>(),
  photoStore: () => ({ storage: { from: () => ({ info: mocks.info, download: mocks.download, createSignedUploadUrl: mocks.sign }) } }) }));
const scope = { id: '11111111-1111-4111-8111-111111111111', recordId: '22222222-2222-4222-8222-222222222222', documentId: '33333333-3333-4333-8333-333333333333' };
const item = { id: scope.documentId, record_id: scope.recordId, original_filename: 'Phiếu khám.pdf', mime_type: 'application/pdf', byte_size: 3,
  storage_path: `family/${scope.id}/${scope.recordId}/${scope.documentId}.pdf`, status: 'ready', deleted: false, created_at: '2025-01-01T00:00:00Z' };
const savedSecret = process.env.EMBE_PORTAL_SESSION_SECRET;
function request(body?: unknown, origin = 'https://embe.hieu.asia') {
  return new Request('https://embe.hieu.asia/api/family/members/documents', { method: body === undefined ? 'GET' : 'POST',
    headers: { cookie: `embe_session=${createSessionCookie('test-secret', new Date(), scope.id)}`, origin, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  vi.clearAllMocks(); process.env.EMBE_PORTAL_SESSION_SECRET = 'test-secret'; mocks.state.mockResolvedValue('active');
  mocks.rpc.mockResolvedValue({ data: item, status: 200 });
  mocks.info.mockResolvedValue({ data: { size: 3, contentType: 'application/pdf' } });
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed-upload' } });
  mocks.download.mockResolvedValue({ data: new Blob(['abc'], { type: 'application/pdf' }) });
});
afterEach(() => { if (savedSecret === undefined) delete process.env.EMBE_PORTAL_SESSION_SECRET; else process.env.EMBE_PORTAL_SESSION_SECRET = savedSecret; });
describe('private family health documents', () => {
  it('requires an active non-revoked family session for every operation', async () => {
    mocks.state.mockResolvedValue('revoked');
    expect((await readFamilyDocument(request(), scope)).status).toBe(401);
    expect((await listFamilyDocuments(request(), scope)).status).toBe(401);
    expect((await createFamilyDocument(request({}), scope)).status).toBe(401);
    expect((await changeFamilyDocument(request({}), scope)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('rejects foreign-origin writes and malformed or oversized metadata before storage', async () => {
    expect((await createFamilyDocument(request({}, 'https://attacker.example'), scope)).status).toBe(403);
    expect((await createFamilyDocument(request({ documentId: scope.documentId, filename: 'x', mimeType: 'text/html', byteSize: 1 }), scope)).status).toBe(400);
    expect(validDocumentMetadata({ documentId: scope.documentId, filename: 'x', mimeType: 'application/pdf', byteSize: 15000001 })).toBe(false);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('binds upload to the member and record and never accepts a caller-supplied path', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...item, status: 'pending' }, status: 200 });
    mocks.info.mockResolvedValue({ data: null, error: { status: 404 } });
    const metadata = { documentId: scope.documentId, filename: 'Phiếu khám.pdf', mimeType: 'application/pdf', byteSize: 3 };
    expect((await createFamilyDocument(request(metadata), scope)).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('embe_family_health_documents', expect.objectContaining({ p_member_id: scope.id, p_record_id: scope.recordId, p_document_id: scope.documentId }));
    expect(mocks.sign).toHaveBeenCalledWith(item.storage_path, { upsert: false });
    expect((await createFamilyDocument(request({ ...metadata, storage_path: 'other-patient.pdf' }), scope)).status).toBe(400);
    expect(publicDocument(item)).not.toHaveProperty('storage_path');
  });
  it('recovers an uploaded file after a lost response without reuploading or overwriting it', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...item, status: 'pending' }, status: 200 });
    const response = await createFamilyDocument(request({ documentId: scope.documentId, filename: item.original_filename, mimeType: item.mime_type, byteSize: 3 }), scope);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: 'ready' });
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('embe_family_health_documents', expect.objectContaining({ p_action: 'complete' }));
  });
  it('blocks wrong-patient and pending/deleted documents before downloading', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, status: 404 });
    expect((await readFamilyDocument(request(), scope)).status).toBe(404);
    mocks.rpc.mockResolvedValueOnce({ data: { ...item, record_id: scope.id }, status: 200 });
    expect((await readFamilyDocument(request(), scope)).status).toBe(503);
    mocks.rpc.mockResolvedValueOnce({ data: { ...item, status: 'pending' }, status: 200 });
    expect((await readFamilyDocument(request(), scope)).status).toBe(404);
    mocks.rpc.mockResolvedValueOnce({ data: { ...item, deleted: true }, status: 200 });
    expect((await readFamilyDocument(request(), scope)).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('verifies storage type and byte size before completing an upload', async () => {
    mocks.info.mockResolvedValueOnce({ data: { size: 2, contentType: 'application/pdf' } });
    expect((await changeFamilyDocument(request({}), scope)).status).toBe(409);
    expect(mocks.rpc.mock.calls.some(([, args]) => args.p_action === 'complete')).toBe(false);
    mocks.rpc.mockClear();
    expect((await changeFamilyDocument(request({}), scope)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('embe_family_health_documents', expect.objectContaining({ p_action: 'complete' }));
  });
  it('returns original bytes with private cache headers, not a permanent public URL', async () => {
    const response = await readFamilyDocument(request(), scope);
    expect(response.status).toBe(200); expect(await response.text()).toBe('abc');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('removes and restores metadata without deleting the original', async () => {
    expect((await changeFamilyDocument(request({ action: 'remove' }), scope)).status).toBe(200);
    expect((await changeFamilyDocument(request({ action: 'restore' }), scope)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('embe_family_health_documents', expect.objectContaining({ p_action: 'restore' }));
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
