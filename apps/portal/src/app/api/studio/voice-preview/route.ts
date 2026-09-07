import { memberAuthorization } from '../../../../lib/family-members-server';
import { serveStudioAsset } from '../../../../lib/studio-media-server';
export const runtime='nodejs';
const samples = {
  'thuc-doan-south-v2': {path:'editorial/54d98d16defeb861107c690439f72cdbb498e4f520fab20a3bfaf861069c509b.mp4',mime:'video/mp4',size:137561,checksum:'54d98d16defeb861107c690439f72cdbb498e4f520fab20a3bfaf861069c509b'},
  'my-duyen-south-v2': {path:'editorial/85ba8f4678405a2130f80d712c6fcbd1b1b3169f086b91898efee11c7e934577.mp4',mime:'video/mp4',size:165894,checksum:'85ba8f4678405a2130f80d712c6fcbd1b1b3169f086b91898efee11c7e934577'},
  'kim-thanh-south-v2': {path:'editorial/791dc442a144cac3b359aa5a0ce37817eb43f32df7d7ebff33fce62e44ce2277.mp4',mime:'video/mp4',size:170386,checksum:'791dc442a144cac3b359aa5a0ce37817eb43f32df7d7ebff33fce62e44ce2277'},
  'ai-han-south': {path:'editorial/345cba4e46e563669f8a214d99c7a1e1ed76af0bf2a8ebef8376f5ecb9830ab4.mp4',mime:'video/mp4',size:87273,checksum:'345cba4e46e563669f8a214d99c7a1e1ed76af0bf2a8ebef8376f5ecb9830ab4'},
  'thuc-doan-south-v1': {path:'editorial/d2c3760c2e0730727c83b2d734cf39a1f3d8cdb295c700c5c5fba4312eebe6c3.mp4',mime:'video/mp4',size:142688,checksum:'d2c3760c2e0730727c83b2d734cf39a1f3d8cdb295c700c5c5fba4312eebe6c3'},
  'my-duyen-south-v1': {path:'editorial/c83e837b5ad25c2c372b5061d864c9731bbd877384b6fefa993cddfe17d57d7e.mp4',mime:'video/mp4',size:167039,checksum:'c83e837b5ad25c2c372b5061d864c9731bbd877384b6fefa993cddfe17d57d7e'},
} as const;
// Fixed locally synthesized sample, no text-to-speech endpoint or user data sent externally.
export async function GET(request:Request) {
  const denied=await memberAuthorization(request);if(denied)return denied;
  // Preserve the old no-query URL; no user-supplied path, URL, text or voice clone.
  const voice=new URL(request.url).searchParams.get('voice')??'ai-han-south';
  if(!Object.hasOwn(samples,voice))return Response.json({error:'invalid_voice'},{status:400,headers:{'Cache-Control':'no-store'}});
  return serveStudioAsset(request,samples[voice as keyof typeof samples],`${voice}-nghe-thu`,'video');
}
