import { memberAuthorization } from '../../../../lib/family-members-server';
import { serveStudioAsset } from '../../../../lib/studio-media-server';
export const runtime='nodejs';
// Fixed locally synthesized sample, no text-to-speech endpoint or user data sent externally.
export async function GET(request:Request) {
  const denied=await memberAuthorization(request);if(denied)return denied;
  return serveStudioAsset(request,{path:'editorial/345cba4e46e563669f8a214d99c7a1e1ed76af0bf2a8ebef8376f5ecb9830ab4.mp4',mime:'video/mp4',size:87273,checksum:'345cba4e46e563669f8a214d99c7a1e1ed76af0bf2a8ebef8376f5ecb9830ab4'},'ai-han-nghe-thu','video');
}
