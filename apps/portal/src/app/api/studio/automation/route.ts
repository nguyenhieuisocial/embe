import { memberAuthorization, memberBody } from '../../../../lib/family-members-server';
import { privateReply } from '../../../../lib/photo-upload-server';
import { workspaceFailure } from '../../../../lib/studio-workspace-server';
export const runtime = 'nodejs';

async function rpc(enabled: boolean | null = null, revision: number | null = null) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return workspaceFailure(503);
  try {
    const r = await fetch(`${new URL(base).origin}/rest/v1/rpc/embe_studio_automation`, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_enabled: enabled, p_revision: revision }),
    });
    if (!r.ok) return workspaceFailure(r.status === 409 ? 409 : 503);
    return privateReply(await r.json(), 200);
  } catch { return workspaceFailure(503); }
}
export async function GET(request: Request) {
  const denied = await memberAuthorization(request); if (denied) return denied;
  return rpc();
}
export async function POST(request: Request) {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  try {
    const value = await memberBody(request, 1024) as Record<string, unknown>;
    if (!value || Array.isArray(value) || Object.keys(value).some(k => !['enabled','revision'].includes(k)) ||
      typeof value.enabled !== 'boolean' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) return workspaceFailure(400);
    return rpc(value.enabled, Number(value.revision));
  } catch { return workspaceFailure(400); }
}
