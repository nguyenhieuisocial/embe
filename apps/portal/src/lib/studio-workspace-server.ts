import { privateReply } from './photo-upload-server';
export async function workspaceRpc(action: string, id: string | null = null, revision: number | null = null, payload: unknown = null): Promise<{ data: any; status: number }> {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return {data:null,status:503};
  try {
    const r = await fetch(`${new URL(base).origin}/rest/v1/rpc/embe_studio_workspace`, {method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({p_action:action,p_id:id,p_revision:revision,p_payload:payload})});
    const data=await r.json(); return {data:r.ok?data:null,status:r.ok?200:[400,404,409,429].includes(r.status)?r.status:503};
  } catch { return {data:null,status:503}; }
}
export function workspaceFailure(status: number) { return privateReply({error:status===409?'revision_conflict':status===429?'queue_full':status===404?'not_found':status===400?'invalid_request':'temporarily_unavailable'},status); }
// Object locators and claim tokens are used only by the server/worker, never as browser URLs.
export function workspacePublic(data: any) {
  const clean = (r: any) => { const {snapshot: _s,claim: _c,output,...rest}=r; return {...rest,output:output?{duration:output.duration,beats:output.beats,voiceCredit:output.voiceCredit,...(output.captions?{captions:output.captions}:{})}:null}; };
  return {...data,...(data.renders?{renders:data.renders.map(clean)}:{}),...(data.render?{render:clean(data.render)}:{})};
}
