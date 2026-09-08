import {memberAuthorization} from '../../../../lib/family-members-server';
import {privateReply} from '../../../../lib/photo-upload-server';
import {studioConnections} from '../../../../lib/studio-connections-server';

export async function GET(request:Request){
  const denied=await memberAuthorization(request,false);
  if(denied)return denied;
  return privateReply(await studioConnections(),200);
}
