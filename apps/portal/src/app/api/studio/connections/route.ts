import {memberAuthorization} from '../../../../lib/family-members-server';
import {privateReply} from '../../../../lib/photo-upload-server';
import {studioConnections,studioConnect} from '../../../../lib/studio-connections-server';
import {memberBody} from '../../../../lib/family-members-server';

export async function GET(request:Request){
  const denied=await memberAuthorization(request,false);
  if(denied)return denied;
  return privateReply(await studioConnections(),200);
}
export async function POST(request:Request){
  const denied=await memberAuthorization(request,true);
  if(denied)return denied;
  let body:unknown;
  try{body=await memberBody(request,1024);}catch{return privateReply({error:'invalid_request'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join(',')!=='provider')return privateReply({error:'invalid_request'},400);
  const result=await studioConnect((body as {provider:unknown}).provider);
  return privateReply(result,result.status==='available'?200:result.status==='unsupported'?400:503);
}
