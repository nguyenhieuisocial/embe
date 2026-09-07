import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({denied:false,rpc:vi.fn()}));
vi.mock('../src/lib/family-members-server',()=>({memberAuthorization:async()=>state.denied?new Response('',{status:401}):null}));
vi.mock('../src/lib/studio-workspace-server',()=>({workspaceRpc:state.rpc,workspaceFailure:(status:number)=>new Response('',{status})}));
import {GET} from '../src/app/api/studio/renders/[id]/[kind]/route';
const id='97b1cd89-3750-4ff6-a6c9-6c49db9f8872';
beforeEach(()=>{state.denied=false;state.rpc.mockReset();});
it('exports fractional frame timing as valid WebVTT milliseconds',async()=>{
  state.rpc.mockResolvedValue({status:200,data:{render:{output:{voiceCredit:{},beats:[{start:0,end:6.291666666,text:'Cảnh một'},{start:6.291666666,end:60.041666666,text:'Cảnh hai'}]}}}});
  const result=await GET(new Request('https://embe.hieu.asia/api/studio/renders/'+id+'/subtitles'),{params:Promise.resolve({id,kind:'subtitles'})});
  expect(result.status).toBe(200);expect(result.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await result.text()).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:06.292\nCảnh một\n\n00:00:06.292 --> 00:01:00.042\nCảnh hai\n');
});
it('does not read scripts or subtitles for an unauthenticated session',async()=>{
  state.denied=true;
  expect((await GET(new Request('https://embe.hieu.asia'),{params:Promise.resolve({id,kind:'script'})})).status).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});
