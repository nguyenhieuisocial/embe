import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({denied:false,rpc:vi.fn()}));
vi.mock('../src/lib/family-members-server',()=>({memberAuthorization:async()=>state.denied?new Response('',{status:401}):null}));
vi.mock('../src/lib/studio-workspace-server',()=>({workspaceRpc:state.rpc,workspaceFailure:(status:number)=>new Response('',{status})}));
import {GET} from '../src/app/api/studio/renders/[id]/[kind]/route';
import {renderSubtitles,studioSocialCaption} from '../src/lib/studio-subtitles';
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
  expect((await GET(new Request('https://embe.hieu.asia'),{params:Promise.resolve({id,kind:'caption'})})).status).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});
it('exports the baked phrase timeline in VTT and SRT, escaping markup and cue injection',async()=>{
  const output={voiceCredit:{},beats:[{start:0,end:5,text:'Old scene'}],captions:{version:1 as const,burnedIn:true as const,language:'vi' as const,timing:'estimated_within_scene' as const,cues:[{start:.125,end:2.5,text:'0,5 mg & <b>chữ</b>\n\n--> giữ nguyên'}]}};
  expect(renderSubtitles(output)).toBe('WEBVTT\n\n00:00:00.125 --> 00:00:02.500\n0,5 mg &amp; &lt;b&gt;chữ&lt;/b&gt;\n--&gt; giữ nguyên\n');
  state.rpc.mockResolvedValue({status:200,data:{render:{output}}});
  const response=await GET(new Request('https://embe.hieu.asia/api/studio/renders/'+id+'/subtitles?format=srt'),{params:Promise.resolve({id,kind:'subtitles'})});
  expect(response.status).toBe(200);expect(response.headers.get('Content-Disposition')).toContain('.srt');
  expect(await response.text()).toContain('1\n00:00:00,125 --> 00:00:02,500');
  expect(()=>renderSubtitles({beats:[{start:2,end:1,text:'bad'}]})).toThrow();
  expect(()=>renderSubtitles({beats:[{start:0,end:Number.NaN,text:'bad'}]})).toThrow();
  expect(()=>renderSubtitles({beats:[{start:0,end:1,text:'  '}]})).toThrow();
});
it('builds a caption from the immutable script without inventing claims',async()=>{
  const snapshot={title:'Một điều nhỏ',stage:'Mẹ bầu',caption:'',scenes:[{heading:'Hôm nay',text:'Đã lưu'}],sources:[{title:'NHS',url:'https://www.nhs.uk/pregnancy/'}]};
  const caption=studioSocialCaption(snapshot);
  expect(caption).toContain('Một điều nhỏ\nMẹ bầu');expect(caption).toContain('chưa duyệt chuyên môn');expect(caption).toContain(snapshot.sources[0].url);
  expect(studioSocialCaption({...snapshot,caption:'Chú thích của tôi'})).toMatch(/^Chú thích của tôi/);
  state.rpc.mockResolvedValue({status:200,data:{render:{snapshot,output:{voiceCredit:{}}}}});
  const response=await GET(new Request('https://embe.hieu.asia/api/studio/renders/'+id+'/caption'),{params:Promise.resolve({id,kind:'caption'})});
  expect(await response.text()).toBe(caption);
});
