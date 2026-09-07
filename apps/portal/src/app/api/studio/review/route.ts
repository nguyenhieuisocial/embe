import { memberAuthorization,memberBody } from '../../../../lib/family-members-server';
import { privateReply } from '../../../../lib/photo-upload-server';
import { uuid } from '../../../../lib/studio-project';
import { studioChannels } from '../../../../lib/studio-review';
import { workspaceFailure } from '../../../../lib/studio-workspace-server';
export const runtime='nodejs';
async function rpc(action:string,id:string|null=null,revision:number|null=null,payload:unknown=null) {
  const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
  if(!base||!key)return workspaceFailure(503);
  try {
    const r=await fetch(`${new URL(base).origin}/rest/v1/rpc/embe_studio_review`,{method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({p_action:action,p_id:id,p_revision:revision,p_payload:payload})});
    if(!r.ok)return workspaceFailure([400,404,409,429].includes(r.status)?r.status:503);
    return privateReply(await r.json(),200);
  } catch{return workspaceFailure(503);}
}
export async function GET(request:Request) {
  const denied=await memberAuthorization(request);if(denied)return denied;
  const id=new URL(request.url).searchParams.get('id');if(id&&!uuid(id))return workspaceFailure(400);
  return rpc(id?'get':'list',id);
}
export async function POST(request:Request) {
  const denied=await memberAuthorization(request,true);if(denied)return denied;
  try {
    const v=await memberBody(request) as Record<string,unknown>;
    if(!v||Object.keys(v).some(k=>!['action','id','revision','note','target','acknowledged'].includes(k))||!uuid(v.id)||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||typeof v.action!=='string'||!['request','comment','cancel'].includes(v.action))return workspaceFailure(400);
    if(typeof v.note!=='string'||v.note.length>1500||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v.note))return workspaceFailure(400);
    if(v.action==='request'&&(v.acknowledged!==true||typeof v.target!=='string'||!Object.hasOwn(studioChannels,v.target)))return workspaceFailure(400);
    return rpc(v.action,v.id,Number(v.revision),{note:v.note.trim(),...(v.action==='request'?{target:v.target}:{})});
  } catch{return workspaceFailure(400);}
}
