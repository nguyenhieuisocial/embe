import { memberAuthorization } from '../../../../../../lib/family-members-server';
import { documentScript, uuid } from '../../../../../../lib/studio-project';
import { renderSubtitles, studioSocialCaption } from '../../../../../../lib/studio-subtitles';
import { serveStudioAsset } from '../../../../../../lib/studio-media-server';
import { workspaceFailure, workspaceRpc } from '../../../../../../lib/studio-workspace-server';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string;kind:string}>}) {
  const denied=await memberAuthorization(request);if(denied)return denied;
  const {id,kind}=await params;if(!uuid(id)||!['video','poster','script','subtitles','caption'].includes(kind))return workspaceFailure(404);
  const format=new URL(request.url).searchParams.get('format')??'vtt';
  if(kind==='subtitles'&&!['vtt','srt'].includes(format))return workspaceFailure(400);
  const result=await workspaceRpc('asset',id);if(result.status!==200)return workspaceFailure(result.status);
  const render=result.data.render;
  if(kind==='video'||kind==='poster')return serveStudioAsset(request,render.output[kind],id,kind);
  const credit=render.output.voiceCredit;
  let value:string;
  try { value=kind==='script'?`${documentScript(render.snapshot)}\n\nGiọng đọc: ${credit.attribution}\n${credit.url}\n${credit.license}`:kind==='caption'?studioSocialCaption(render.snapshot):renderSubtitles(render.output,format as 'vtt'|'srt'); }
  catch { return workspaceFailure(503); }
  const extension=kind==='subtitles'?format:'txt';
  return new Response(value,{headers:{'Cache-Control':'private, no-store','Content-Type':kind==='subtitles'&&format==='vtt'?'text/vtt; charset=utf-8':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="embe-${id}${kind==='caption'?'-caption':''}.${extension}"`}});
}
