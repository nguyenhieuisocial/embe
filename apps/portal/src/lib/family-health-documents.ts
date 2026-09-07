import { UUID } from './family-members';
import { MEDICAL_MAX_BYTES, MEDICAL_MIME_TYPES } from './pregnancy-medical';

export type FamilyHealthDocument = {
  id: string; originalFilename: string; mimeType: string; byteSize: number;
  status: 'pending' | 'ready'; deleted: boolean; createdAt: string;
};
export function validDocumentMetadata(value: unknown): value is { documentId: string; filename: string; mimeType: string; byteSize: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(key => ['documentId', 'filename', 'mimeType', 'byteSize'].includes(key))
    && typeof v.documentId === 'string' && UUID.test(v.documentId)
    && typeof v.filename === 'string' && !!v.filename.trim() && v.filename.length <= 180 && !/[\u0000-\u001f]/.test(v.filename)
    && typeof v.mimeType === 'string' && MEDICAL_MIME_TYPES.has(v.mimeType)
    && Number.isSafeInteger(v.byteSize) && Number(v.byteSize) > 0 && Number(v.byteSize) <= MEDICAL_MAX_BYTES;
}

// The UI receives no bucket path or permanent public link.
export function publicDocument(value: unknown): FamilyHealthDocument | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!validDocumentMetadata({ documentId: v.id, filename: v.original_filename, mimeType: v.mime_type, byteSize: v.byte_size })
    || !['pending', 'ready'].includes(String(v.status)) || typeof v.deleted !== 'boolean' || typeof v.created_at !== 'string') return null;
  return { id: String(v.id), originalFilename: String(v.original_filename), mimeType: String(v.mime_type), byteSize: Number(v.byte_size),
    status: v.status as 'pending' | 'ready', deleted: v.deleted, createdAt: v.created_at };
}
