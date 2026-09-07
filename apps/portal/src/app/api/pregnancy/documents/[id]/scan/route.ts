import { memberAuthorization, memberBody } from '../../../../../../lib/family-members-server';
import { isUuidV4, photoStore, privateReply } from '../../../../../../lib/photo-upload-server';
import { validDocumentAnalysis } from '../../../../../../lib/medical-document-scan';
import { revalidateFamilyViews } from '../../../../../../lib/family-view-revalidation';

type Context = { params: Promise<{ id: string }> };
async function execute(request: Request, context: Context, method: 'GET' | 'POST' | 'PATCH') {
  const denied = await memberAuthorization(request, method !== 'GET');
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuidV4(id)) return privateReply({ error: 'invalid_request' }, 400);
  let body: Record<string, unknown> = {};
  if (method !== 'GET') {
    try { body = await memberBody(request) as Record<string, unknown>; } catch { return privateReply({ error: 'invalid_request' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return privateReply({ error: 'invalid_request' }, 400);
    if (method === 'POST' && Object.keys(body).length) return privateReply({ error: 'invalid_request' }, 400);
    if (method === 'PATCH' && (Object.keys(body).sort().join(',') !== 'analysis,confirmed,revision' || body.confirmed !== true
      || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1 || !validDocumentAnalysis(body.analysis))) {
      return privateReply({ error: 'invalid_review' }, 400);
    }
  }
  const store = photoStore();
  if (!store) return privateReply({ error: 'temporarily_unavailable' }, 503);
  try {
    const name = method === 'GET' ? 'embe_get_document_scan' : method === 'POST' ? 'embe_queue_document_scan' : 'embe_confirm_document_scan';
    const args = { p_document_id: id, ...(method === 'PATCH' ? { p_revision: body.revision, p_analysis: body.analysis } : {}) };
    const result = await store.rpc(name, args);
    if (result.error) {
      const status = result.error.code === '40001' ? 409 : result.error.code === 'P0002' ? 404 : result.error.code === '22023' ? 400 : 503;
      return privateReply({ error: status === 409 ? 'revision_conflict' : status === 404 ? 'not_found' : 'temporarily_unavailable' }, status);
    }
    if (!result.data) return privateReply({ error: 'not_found' }, 404);
    if (result.data.analysis && !validDocumentAnalysis(result.data.analysis)) return privateReply({ error: 'invalid_analysis' }, 503);
    if (method === 'PATCH') revalidateFamilyViews();
    return privateReply(result.data, method === 'POST' && ['queued', 'processing'].includes(result.data.status) ? 202 : 200);
  } catch { return privateReply({ error: 'temporarily_unavailable' }, 503); }
}
export const GET = (request: Request, context: Context) => execute(request, context, 'GET');
export const POST = (request: Request, context: Context) => execute(request, context, 'POST');
export const PATCH = (request: Request, context: Context) => execute(request, context, 'PATCH');
