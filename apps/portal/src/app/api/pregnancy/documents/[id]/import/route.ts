import { memberAuthorization, memberBody } from '../../../../../../lib/family-members-server';
import { isUuidV4, photoStore, privateReply } from '../../../../../../lib/photo-upload-server';
import { validDocumentAnalysis } from '../../../../../../lib/medical-document-scan';
import { validImportDetails } from '../../../../../../lib/medical-document-import';
import { normalizeMedicalRecord } from '../../../../../../lib/pregnancy-medical';
import { revalidateFamilyViews } from '../../../../../../lib/family-view-revalidation';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = await memberAuthorization(request); if (denied) return denied;
  const { id } = await context.params; if (!isUuidV4(id)) return privateReply({ error: 'invalid_request' }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: 'temporarily_unavailable' }, 503);
  try {
    const [info, list] = await Promise.all([
      store.rpc('embe_document_import_context', { p_document_id: id }).abortSignal(AbortSignal.timeout(12000)),
      store.rpc('embe_list_pregnancy_medical_records').abortSignal(AbortSignal.timeout(12000)),
    ]);
    if (info.error || list.error || !Array.isArray(list.data)) return privateReply({ error: 'temporarily_unavailable' }, 503);
    if (!info.data) return privateReply({ error: 'not_found' }, 404);
    return privateReply({ ...info.data, records: list.data.flatMap((v: unknown) => { const r = normalizeMedicalRecord(v); return r ? [r] : []; }) }, 200);
  } catch { return privateReply({ error: 'temporarily_unavailable' }, 503); }
}
export async function POST(request: Request, context: Context) {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  const { id } = await context.params; if (!isUuidV4(id)) return privateReply({ error: 'invalid_request' }, 400);
  let input: Record<string, unknown>;
  try { input = await memberBody(request) as Record<string, unknown>; } catch { return privateReply({ error: 'invalid_request' }, 400); }
  if (!input || Object.keys(input).sort().join(',') !== 'analysis,confirmed,details,patientConfirmed,recordUpdatedAt,revision'
    || input.confirmed !== true || input.patientConfirmed !== true || !validDocumentAnalysis(input.analysis) || !validImportDetails(input.details)
    || !Number.isSafeInteger(input.revision) || Number(input.revision) < 1 || typeof input.recordUpdatedAt !== 'string'
    || !Number.isFinite(Date.parse(input.recordUpdatedAt))) return privateReply({ error: 'invalid_import' }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: 'temporarily_unavailable' }, 503);
  try {
    const result = await store.rpc('embe_import_document', { p_document_id: id, p_revision: input.revision,
      p_record_updated_at: input.recordUpdatedAt, p_analysis: input.analysis, p_details: input.details }).abortSignal(AbortSignal.timeout(12000));
    if (result.error) return privateReply({ error: result.error.code === 'PT409' ? 'import_conflict' : result.error.code === 'PT404' ? 'not_found' : 'import_unavailable' },
      result.error.code === 'PT409' ? 409 : result.error.code === 'PT404' ? 404 : result.error.code === '22023' ? 400 : 503);
    if (!result.data?.imported || !isUuidV4(result.data.recordId)) return privateReply({ error: 'import_unavailable' }, 503);
    revalidateFamilyViews(); return privateReply(result.data, 200);
  } catch { return privateReply({ error: 'temporarily_unavailable' }, 503); }
}
