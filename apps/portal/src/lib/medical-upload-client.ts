import { prepareImageForUpload } from './image-preparation-client';

export async function uploadDocument(recordId: string, file: File, documentId: string): Promise<{ documentId: string; mimeType: string }> {
  return uploadPrivateDocument(file, documentId, `/api/pregnancy/records/${recordId}/documents`, `/api/pregnancy/documents/${documentId}`);
}

export async function uploadFamilyDocument(memberId: string, recordId: string, file: File, documentId: string) {
  const base = `/api/family/members/${memberId}/records/${recordId}/documents`;
  return uploadPrivateDocument(file, documentId, base, `${base}/${documentId}`);
}

async function uploadPrivateDocument(file: File, documentId: string, createUrl: string, completeUrl: string): Promise<{ documentId: string; mimeType: string }> {
  const prepared = file.type === 'application/pdf' ? file : await prepareImageForUpload(file, {
    filename: file.name.replace(/\.[^.]+$/, '') + '.jpg', maxBytes: 15_000_000, maxDimension: 3200, quality: .94, preserveOriginal: true,
  });
  if (!prepared.size || prepared.size > 15_000_000) throw new Error('file_too_large');
  const created = await fetch(createUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentId, filename: prepared.name || 'tai-lieu', mimeType: prepared.type, byteSize: prepared.size }),
    signal: AbortSignal.timeout(20000),
  });
  if (!created.ok) throw new Error('create_document_failed');
  const session = await created.json() as { uploadUrl?: string; status?: string };
  if (session.status === 'ready') return { documentId, mimeType: prepared.type };
  if (!session.uploadUrl) throw new Error('create_document_failed');
  const form = new FormData(); form.append('cacheControl', '0'); form.append('', prepared);
  const uploaded = await fetch(session.uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form, signal: AbortSignal.timeout(120000) });
  // An ambiguous retry may find the same object. Completion verifies type and size.
  if (!uploaded.ok && uploaded.status !== 409 && uploaded.status !== 400) throw new Error('upload_failed');
  const completed = await fetch(completeUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20000),
  });
  if (!completed.ok) throw new Error('complete_failed');
  return { documentId, mimeType: prepared.type };
}
