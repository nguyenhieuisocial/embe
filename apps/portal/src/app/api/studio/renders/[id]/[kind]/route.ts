import { memberAuthorization } from '../../../../../../lib/family-members-server';
import { documentScript, uuid } from '../../../../../../lib/studio-project';
import { studioTimestamp as stamp } from '../../../../../../lib/studio-timing';
import { serveStudioAsset } from '../../../../../../lib/studio-media-server';
import { workspaceFailure, workspaceRpc } from '../../../../../../lib/studio-workspace-server';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string;kind:string}>}) {
  const denied=await memberAuthorization(request);if(denied)return denied;
  const {id,kind}=await params;if(!uuid(id)||!['video','poster','script','subtitles'].includes(kind))return workspaceFailure(404);
  const result=await workspaceRpc('asset',id);if(result.status!==200)return workspaceFailure(result.status);
  const render=result.data.render;
  if(kind==='video'||kind==='poster')return serveStudioAsset(request,render.output[kind],id,kind);
  const credit=render.output.voiceCredit;
  const value=kind==='script'?`${documentScript(render.snapshot)}\n\nGiọng đọc: ${credit.attribution}\n${credit.url}\n${credit.license}`:`WEBVTT\n\n${render.output.beats.map((b:{start:number;end:number;text:string})=>`${stamp(b.start)} --> ${stamp(b.end)}\n${b.text}\n`).join('\n')}`;
  return new Response(value,{headers:{'Cache-Control':'private, no-store','Content-Type':kind==='script'?'text/plain; charset=utf-8':'text/vtt; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="embe-${id}.${kind==='script'?'txt':'vtt'}"`}});
}
