import { memberAuthorization, memberBody } from '../../../../lib/family-members-server';
import { isUuidV4, photoStore, privateReply } from '../../../../lib/photo-upload-server';

export async function POST(request: Request) {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  let input: Record<string, unknown>;
  try { input = await memberBody(request) as Record<string, unknown>; } catch { return privateReply({ error: 'invalid_request' }, 400); }
  if (!input || Object.keys(input).sort().join(',') !== 'id,title' || !isUuidV4(input.id)
    || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100) return privateReply({ error: 'invalid_request' }, 400);
  const store = photoStore(); if (!store) return privateReply({ error: 'temporarily_unavailable' }, 503);
  try {
    const result = await store.rpc('embe_create_document_intake', { p_id: input.id, p_title: input.title }).abortSignal(AbortSignal.timeout(12000));
    if (result.error || !isUuidV4(result.data)) return privateReply({ error: 'intake_unavailable' }, result.error?.code === 'PT409' ? 409 : 503);
    return privateReply({ id: result.data }, 201);
  } catch { return privateReply({ error: 'temporarily_unavailable' }, 503); }
}
