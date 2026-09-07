import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SouthernVoiceSample} from '../src/components/studio-voice-picker';
import {studioDocument,templateDocument} from '../src/lib/studio-project';
const auth=vi.hoisted(()=>({denied:false}));
const media=vi.hoisted(()=>({serve:vi.fn(async()=>new Response('sample'))}));
vi.mock('../src/lib/family-members-server',()=>({memberAuthorization:async()=>auth.denied?new Response('',{status:401}):null}));
vi.mock('../src/lib/studio-media-server',()=>({serveStudioAsset:media.serve}));
import {GET} from '../src/app/api/studio/voice-preview/route';
beforeEach(()=>{auth.denied=false;media.serve.mockClear();});
afterEach(()=>cleanup());
it('persists both new voices and preserves the old explicit voice and speed',()=>{
  for(const id of ['thuc-doan-south-v1','my-duyen-south-v1','ai-han-south','piper'])for(const speed of [.95,1,1.05])
    expect(studioDocument({...templateDocument(),voice:{id,speed}}).voice).toEqual({id,speed});
});
it('serves only fixed authenticated samples and keeps the old default URL',async()=>{
  auth.denied=true;expect((await GET(new Request('https://embe.hieu.asia/api/studio/voice-preview?voice=thuc-doan-south-v1'))).status).toBe(401);expect(media.serve).not.toHaveBeenCalled();
  auth.denied=false;
  for(const voice of ['__proto__','constructor','https://evil.test','../../secret','piper'])
    expect((await GET(new Request(`https://embe.hieu.asia/api/studio/voice-preview?voice=${encodeURIComponent(voice)}`))).status).toBe(400);
  expect(media.serve).not.toHaveBeenCalled();
  for(const voice of ['','thuc-doan-south-v1','my-duyen-south-v1'])expect((await GET(new Request(`https://embe.hieu.asia/api/studio/voice-preview${voice?'?voice='+voice:''}`))).status).toBe(200);
  const assets=media.serve.mock.calls.map(call=>(call as unknown[])[1] as {size:number;path:string});
  expect(assets.map(a=>a.size)).toEqual([87273,142688,167039]);expect(assets.every(a=>/^editorial\/[a-f\d]{64}\.mp4$/.test(a.path))).toBe(true);
});
it('switching voices stops/unmounts the old audio and does not autoplay the new sample',()=>{
  render(<SouthernVoiceSample/>);
  fireEvent.click(screen.getByRole('button',{name:'Nghe mẫu Thục Đoan'}));
  const old=document.querySelector('audio');expect(old?.getAttribute('src')).toContain('thuc-doan-south-v1');
  fireEvent.change(screen.getByLabelText('Giọng nghe thử'),{target:{value:'my-duyen-south-v1'}});
  expect(old?.isConnected).toBe(false);expect(document.querySelector('audio')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Nghe mẫu Mỹ Duyên'}));
  const next=document.querySelector('audio');expect(next?.getAttribute('src')).toContain('my-duyen-south-v1');expect(next?.getAttribute('preload')).toBe('none');expect(next?.autoplay).toBe(false);
});
it('preview tempo preserves pitch and changing speed requires an explicit play again',()=>{
  const {rerender}=render(<SouthernVoiceSample voice="thuc-doan-south-v1" speed={.95}/>);
  fireEvent.click(screen.getByRole('button',{name:'Nghe mẫu Thục Đoan'}));const audio=document.querySelector('audio')!;fireEvent.loadedMetadata(audio);
  expect(audio.playbackRate).toBe(.95);expect(audio.preservesPitch).toBe(true);
  rerender(<SouthernVoiceSample voice="thuc-doan-south-v1" speed={1.05}/>);expect(document.querySelector('audio')).toBeNull();
});
