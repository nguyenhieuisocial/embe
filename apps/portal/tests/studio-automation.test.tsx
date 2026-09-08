import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { studioDocument } from '../src/lib/studio-project';
import StudioAutomation from '../src/components/studio-automation';
const auth = vi.hoisted(() => ({ denied: false, check: vi.fn() }));
vi.mock('../src/lib/family-members-server', () => ({ memberAuthorization: async (...args: unknown[]) => { auth.check(...args); return auth.denied ? new Response('', {status:401}) : null; }, memberBody: (r: Request) => r.json() }));
import { GET, POST } from '../src/app/api/studio/automation/route';
const status = { enabled:true,revision:2,nextRunAt:'2026-09-09T01:00:00Z',status:'scheduled',remaining:6,reviewDue:'2026-10-07',workerSeenAt:new Date().toISOString(),history:[],publication:{status:'not_connected',publishedCount:0} };
const req = (body: unknown) => new Request('https://embe.hieu.asia/api/studio/automation', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(() => { auth.denied=false; auth.check.mockClear(); vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_SECRET_KEY','test-only'); });
afterEach(() => { vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs(); });

describe('Studio automatic creation', () => {
  it('authenticates reads and same-origin mutations before calling the database', async () => {
    auth.denied=true; const fetch=vi.spyOn(globalThis,'fetch');
    expect((await GET(req({}))).status).toBe(401);expect((await POST(req({enabled:false,revision:2}))).status).toBe(401);
    expect(auth.check).toHaveBeenLastCalledWith(expect.any(Request),true);expect(fetch).not.toHaveBeenCalled();
  });
  it('only accepts a revision-checked pause/resume, never a publish claim or a script injection', async () => {
    const fetch=vi.spyOn(globalThis,'fetch');
    for(const value of [null,[],{enabled:'true',revision:2},{enabled:true,revision:0},{enabled:true,revision:2,approved:true},{enabled:true,revision:2,url:'https://example.com'}]) expect((await POST(req(value))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves conflicts and serves status privately without creating a job on GET', async () => {
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json(status));
    const response=await GET(req({}));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({p_enabled:null,p_revision:null});
    fetch.mockResolvedValueOnce(new Response('{}',{status:409}));expect((await POST(req({enabled:false,revision:2}))).status).toBe(409);
  });
  it('does not silently alter researched scenes, sources or review dates when seeding automation', () => {
    const sql=readFileSync('../../supabase/migrations/20260907234549_studio_daily_creation.sql','utf8');
    const catalog=JSON.parse(readFileSync('../../services/studio/content/catalog.json','utf8'));
    const seeds=JSON.parse(sql.split('$catalog$')[1]);expect(seeds).toHaveLength(7);
    for(const seed of seeds){
      const source=catalog.items.find((t:{slug:string})=>t.slug===seed.slug);expect(source).toBeDefined();
      const doc=studioDocument(seed.payload);expect(doc.autoRender).toBe(true);expect(doc.voice?.id).toBe('auto-south');
      expect(doc.scenes).toEqual(source.beats.map((b:{heading:string;text:string})=>({heading:b.heading,text:b.text})));
      expect(doc.sources).toEqual(source.sources.map((key:string)=>({title:catalog.sources[key].publisher,url:catalog.sources[key].url})));
      expect(seed.checked_at).toBe(catalog.sources_checked_at);expect(seed.review_due).toBe(catalog.review_due);
    }
    expect(seeds.some((s:{slug:string})=>s.slug==='van-dong-khong-can-kiet-suc')).toBe(false);
  });
  it('opens without posting, does not auto-play, and persists pause only after success', async () => {
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({...status,history:[{slug:'test',project_id:'p',title:'Chủ đề tự chọn',created_at:'2026-09-08T01:00:00Z',deleted:false,render_id:'r',render_status:'completed',progress:100,error:null}]}));
    render(<StudioAutomation/>);await screen.findByRole('button',{name:'Tạm dừng'});
    expect(fetch.mock.calls[0][1]?.method).toBeUndefined();expect(screen.getByText('Chưa đăng lên mạng xã hội')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toHaveAttribute('autoplay');expect(document.querySelector('video')).toHaveAttribute('preload','none');
    fetch.mockResolvedValueOnce(Response.json({...status,enabled:false,revision:3,status:'paused'}));fireEvent.click(screen.getByRole('button',{name:'Tạm dừng'}));
    await screen.findByRole('button',{name:'Tiếp tục tự tạo'});expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({enabled:false,revision:2});
  });
  it('keeps actual enabled state after a failed pause, instead of promising the worker stopped', async () => {
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json(status));render(<StudioAutomation/>);await screen.findByRole('button',{name:'Tạm dừng'});
    fetch.mockResolvedValueOnce(new Response('{}',{status:503}));fireEvent.click(screen.getByRole('button',{name:'Tạm dừng'}));
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Cài đặt trên máy chủ không bị thay đổi'));
    expect(screen.getByRole('button',{name:'Tạm dừng'})).toBeEnabled();
  });
  it('shows automatic handoff and refreshes without asking the user or creating a job',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({...status,handoff:{status:'ready',pendingCount:2,devices:2,notificationsPending:1,notificationsSent:0}}));
    const view=render(<StudioAutomation/>);await screen.findByRole('link',{name:'2 video trong hàng chờ duyệt'});
    expect(screen.getByText(/Báo video mới trên 2 thiết bị/)).toBeInTheDocument();
    vi.useFakeTimers();
    // Simulate reconnect rather than waiting for a button press.
    fetch.mockResolvedValue(Response.json({...status,handoff:{status:'ready',pendingCount:3,devices:2,notificationsPending:0,notificationsSent:1}}));
    await act(async()=>{window.dispatchEvent(new Event('online'));});
    expect(screen.getByRole('link',{name:'3 video trong hàng chờ duyệt'})).toBeInTheDocument();
    expect(fetch.mock.calls.every(([,options])=>!options?.method)).toBe(true);
    view.unmount();
  });
});
