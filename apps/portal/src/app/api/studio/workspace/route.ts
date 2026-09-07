import { memberAuthorization } from '../../../../lib/family-members-server';
import { privateReply } from '../../../../lib/photo-upload-server';
import { validateBoard } from '../../../../lib/studio-discovery';
import { readyToRender, studioDocument, uuid } from '../../../../lib/studio-project';
import { workspaceFailure, workspacePublic, workspaceRpc } from '../../../../lib/studio-workspace-server';
export const runtime='nodejs';
export async function GET(request:Request) {
  const denied=await memberAuthorization(request); if(denied)return denied;
  const url=new URL(request.url), id=url.searchParams.get('project');
  if(id&&!uuid(id))return workspaceFailure(400);
  const result=await workspaceRpc(id?'get':url.searchParams.get('board')==='1'?'board':'list',id);
  return result.status===200?privateReply(workspacePublic(result.data),200):workspaceFailure(result.status);
}
async function body(request:Request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('body');
  const reader=request.body?.getReader(); if(!reader)throw new Error('body');
  const parts:Uint8Array[]=[];let size=0;
  try { while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>1050000){await reader.cancel();throw new Error('size');}parts.push(p.value);} }
  finally{reader.releaseLock();}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
}
export async function POST(request:Request) {
  const denied=await memberAuthorization(request,true);if(denied)return denied;
  try {
    const input=await body(request);
    if(!input||typeof input!=='object'||!Number.isSafeInteger(input.revision)||input.revision<0) return workspaceFailure(400);
    if(input.action==='save-board'){
      const result=await workspaceRpc('save-board',null,input.revision,validateBoard(input.items));
      return result.status===200?privateReply(result.data,200):workspaceFailure(result.status);
    }
    if(!uuid(input.id)||!['save','delete','restore','render','cancel'].includes(input.action))return workspaceFailure(400);
    let payload=null;
    if(input.action==='save')payload=studioDocument(input.payload);
    if(input.action==='render'){
      if(input.acknowledged!==true)return privateReply({error:'review_required'},400);
      const current=await workspaceRpc('get',input.id);if(current.status!==200)return workspaceFailure(current.status);
      if(current.data.project.revision!==input.revision)return workspaceFailure(409);
      if(!readyToRender(studioDocument(current.data.project.payload)))return privateReply({error:'scenes_and_sources_required'},400);
    }
    const result=await workspaceRpc(input.action,input.id,input.revision,payload);
    return result.status===200?privateReply(workspacePublic(result.data),200):workspaceFailure(result.status);
  }catch{return workspaceFailure(400);}
}
