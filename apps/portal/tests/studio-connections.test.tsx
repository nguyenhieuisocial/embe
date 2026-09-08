import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {studioConnections,studioConnect} from '../src/lib/studio-connections-server';
import StudioConnectionsPanel from '../src/components/studio-connections';
const auth=vi.hoisted(()=>({denied:false}));
vi.mock('../src/lib/family-members-server',()=>({memberAuthorization:async()=>auth.denied?new Response('',{status:401}):null,memberBody:async(request:Request)=>request.json()}));
import {GET,POST} from '../src/app/api/studio/connections/route';
const fetcher=vi.fn();
it('requires authorization and a supported provider before requesting OAuth',async()=>{
 auth.denied=true;
 expect((await POST(new Request('https://embe.hieu.asia/api/studio/connections',{method:'POST',body:JSON.stringify({provider:'youtube'})}))).status).toBe(401);
 expect(fetcher).not.toHaveBeenCalled();
 expect(await studioConnect('zalo')).toEqual({status:'unsupported'});
 expect(await studioConnect('__proto__')).toEqual({status:'unsupported'});
 expect(await studioConnect('youtube')).toEqual({status:'not_configured'});
});
it('only returns a verified provider authorization URL and keeps the API key private',async()=>{
 vi.stubEnv('EMBE_POSTIZ_API_KEY','private-key');
 fetcher.mockResolvedValueOnce(Response.json({url:'https://accounts.google.com/o/oauth2/auth?state=opaque',secret:'private-key'}));
 expect(await studioConnect('youtube')).toEqual({status:'available',url:'https://accounts.google.com/o/oauth2/auth?state=opaque'});
 expect(fetcher).toHaveBeenCalledWith('https://api.postiz.com/public/v1/social/youtube',expect.objectContaining({redirect:'error',headers:{Authorization:'private-key'}}));
 for(const url of ['javascript:alert(1)','https://accounts.google.com.evil.test/auth','https://user:pass@accounts.google.com/auth','https://accounts.google.com:8443/auth','http://accounts.google.com/auth']){
  fetcher.mockResolvedValueOnce(Response.json({url}));expect(await studioConnect('youtube')).toEqual({status:'unavailable'});
 }
});
beforeEach(()=>{auth.denied=false;vi.stubEnv('EMBE_POSTIZ_API_KEY','');vi.stubGlobal('fetch',fetcher);fetcher.mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('does not contact Postiz without configuration or authentication',async()=>{
  expect(await studioConnections()).toEqual({status:'not_configured',accounts:[]});
  auth.denied=true;expect((await GET(new Request('https://embe.hieu.asia/api/studio/connections'))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it('only returns display fields with no credential, profile URL or provider payload',async()=>{
  vi.stubEnv('EMBE_POSTIZ_API_KEY','private-key');
  fetcher.mockResolvedValue(new Response(JSON.stringify([{name:'Kênh EmBe',identifier:'youtube',disabled:false,token:'secret',picture:'https://tracker.test',id:'opaque'}])));
  const response=await GET(new Request('https://embe.hieu.asia/api/studio/connections'));
  expect(await response.json()).toEqual({status:'available',accounts:[{name:'Kênh EmBe',provider:'youtube',disabled:false}]});
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(fetcher).toHaveBeenCalledWith('https://api.postiz.com/public/v1/integrations',expect.objectContaining({headers:{Authorization:'private-key'},redirect:'error',cache:'no-store'}));
});
it('keeps an empty list distinct from unavailable, and rejects malformed provider data',async()=>{
  vi.stubEnv('EMBE_POSTIZ_API_KEY','private-key');
  fetcher.mockResolvedValueOnce(new Response('[]'));
  expect((await studioConnections()).status).toBe('available');
  for(const data of [{error:'secret'},[{}],[{name:'x',identifier:'youtube',disabled:'false'}],Array(101).fill({})]){
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
    expect(await studioConnections()).toEqual({status:'unavailable',accounts:[]});
  }
  for(const status of [401,403,429,500]){
    fetcher.mockResolvedValueOnce(new Response('private error',{status}));
    expect((await studioConnections()).status).toBe(status<404?'authorization_required':'unavailable');
  }
  fetcher.mockRejectedValueOnce(new Error('private-key'));
  expect(await studioConnections()).toEqual({status:'unavailable',accounts:[]});
});
it('stays collapsed and only checks on request, with no publish action',async()=>{
  fetcher.mockResolvedValue(new Response(JSON.stringify({status:'not_configured',accounts:[]})));
  render(<StudioConnectionsPanel/>);
  expect(document.querySelector('details')?.open).toBe(false);expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra kết nối'}));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Chưa cấu hình Postiz'));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('checks automatically once when opened and identifies an expired EmBe session',async()=>{
  fetcher.mockResolvedValue(new Response('',{status:401}));
  render(<StudioConnectionsPanel/>);
  const disclosure=document.querySelector('details')!;
  disclosure.open=true;fireEvent(disclosure,new Event('toggle'));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Phiên EmBe đã hết hạn'));
  disclosure.open=false;fireEvent(disclosure,new Event('toggle'));
  disclosure.open=true;fireEvent(disclosure,new Event('toggle'));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('aborts a pending check on unmount',()=>{
  fetcher.mockReturnValue(new Promise(()=>{}));
  const {unmount}=render(<StudioConnectionsPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra kết nối'}));
  const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
  expect(signal.aborted).toBe(false);unmount();expect(signal.aborted).toBe(true);
});
