import { UUID } from './family-members';
import { memberAuthorization, memberBody, memberFailure, memberRpc } from './family-members-server';
import { photoStore, privateReply } from './photo-upload-server';
import { MEDICAL_BUCKET, MEDICAL_MIME_TYPES } from './pregnancy-medical';
import { publicDocument, validDocumentMetadata } from './family-health-documents';

type Scope = { id: string; recordId: string; documentId?: string };
const validScope = (scope: Scope) => UUID.test(scope.id) && UUID.test(scope.recordId) && (scope.documentId === undefined || UUID.test(scope.documentId));
const rpc = (s: Scope, action: string, metadata = {}) => memberRpc('embe_family_health_documents', {
  p_member_id: s.id, p_record_id: s.recordId, p_action: action, p_document_id: s.documentId ?? null, p_metadata: metadata,
});

export async function listFamilyDocuments(request: Request, scope: Scope) {
  const denied = await memberAuthorization(request); if (denied) return denied;
  if (!validScope(scope)) return memberFailure(400);
  const result = await rpc(scope, 'list');
  if (result.status !== 200) return memberFailure(result.status);
  if (!Array.isArray(result.data) || result.data.length > 30) return memberFailure(503);
  const documents = result.data.map(publicDocument);
  return documents.every(Boolean) ? privateReply({ documents }, 200) : memberFailure(503);
}

export async function createFamilyDocument(request: Request, scope: Scope) {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  if (!validScope(scope)) return memberFailure(400);
  let value: unknown; try { value = await memberBody(request, 4096); } catch { return memberFailure(400); }
  if (!validDocumentMetadata(value)) return memberFailure(400);
  const store = photoStore(); if (!store) return memberFailure(503);
  const result = await rpc({ ...scope, documentId: value.documentId }, 'create', value);
  if (result.status !== 200) return memberFailure(result.status);
  const item = result.data as Record<string, unknown>;
  const doc = publicDocument(item);
  if (!doc || !validStoragePath(scope, item)) return memberFailure(503);
  try {
    // Recover an upload whose final response was lost; never overwrite an existing original.
    if (doc.status === 'ready') return privateReply({ documentId: doc.id, status: 'ready' }, 200);
    const existing = await store.storage.from(MEDICAL_BUCKET).info(String(item.storage_path));
    if (existing.data) {
      if (existing.data.size !== doc.byteSize || existing.data.contentType?.split(';', 1)[0].toLowerCase() !== doc.mimeType) return privateReply({ error: 'upload_mismatch' }, 409);
      const completed = await rpc({ ...scope, documentId: doc.id }, 'complete');
      return completed.status === 200 ? privateReply({ documentId: doc.id, status: 'ready' }, 200) : memberFailure(completed.status);
    }
    const signed = await store.storage.from(MEDICAL_BUCKET).createSignedUploadUrl(String(item.storage_path), { upsert: false });
    return !signed.error && signed.data?.signedUrl ? privateReply({ documentId: doc.id, uploadUrl: signed.data.signedUrl }, 201) : memberFailure(503);
  } catch { return memberFailure(503); }
}

function validStoragePath(scope: Scope, item: Record<string, unknown>): boolean {
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as Record<string, string>)[String(item.mime_type)];
  return !!ext && item.record_id === scope.recordId && (scope.documentId === undefined || item.id === scope.documentId)
    && item.storage_path === `family/${scope.id}/${scope.recordId}/${item.id}.${ext}`;
}

export async function readFamilyDocument(request: Request, scope: Scope) {
  const denied = await memberAuthorization(request); if (denied) return denied;
  if (!validScope(scope) || !scope.documentId) return memberFailure(400);
  const result = await rpc(scope, 'get');
  if (result.status !== 200) return memberFailure(result.status);
  const item = result.data as Record<string, unknown>;
  const doc = publicDocument(item);
  if (!doc || !validStoragePath(scope, item)) return memberFailure(503);
  if (doc.status !== 'ready' || doc.deleted) return memberFailure(404);
  const store = photoStore(); if (!store) return memberFailure(503);
  try {
    const downloaded = await store.storage.from(MEDICAL_BUCKET).download(String(item.storage_path));
    if (downloaded.error || !downloaded.data || downloaded.data.size !== doc.byteSize) return memberFailure(503);
    return new Response(downloaded.data, { headers: { 'content-type': doc.mimeType,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`,
      'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch { return memberFailure(503); }
}

export async function changeFamilyDocument(request: Request, scope: Scope) {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  if (!validScope(scope) || !scope.documentId) return memberFailure(400);
  let value: unknown; try { value = await memberBody(request, 1024); } catch { return memberFailure(400); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'action')) return memberFailure(400);
  const action = (value as { action?: unknown }).action ?? 'complete';
  if (!['complete', 'remove', 'restore'].includes(String(action))) return memberFailure(400);
  if (action === 'complete') {
    const result = await rpc(scope, 'get');
    if (result.status !== 200) return memberFailure(result.status);
    const item = result.data as Record<string, unknown>;
    if (!publicDocument(item) || !validStoragePath(scope, item)) return memberFailure(503);
    const store = photoStore(); if (!store) return memberFailure(503);
    try {
      const object = await store.storage.from(MEDICAL_BUCKET).info(String(item.storage_path));
      const mime = object.data?.contentType?.split(';', 1)[0].toLowerCase();
      if (object.error || object.data?.size !== item.byte_size || mime !== item.mime_type || !mime || !MEDICAL_MIME_TYPES.has(mime)) {
        return privateReply({ error: 'upload_mismatch' }, 409);
      }
    } catch { return memberFailure(503); }
  }
  const changed = await rpc(scope, String(action));
  const document = changed.status === 200 ? publicDocument(changed.data) : null;
  return document ? privateReply({ document, status: document.status }, 200) : memberFailure(changed.status === 200 ? 503 : changed.status);
}
