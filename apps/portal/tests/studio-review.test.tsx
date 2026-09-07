import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {studioDocument,templateDocument} from '../src/lib/studio-project';
import {editorialChecks} from '../src/lib/studio-review';
import StudioVoicePicker from '../src/components/studio-voice-picker';
import StudioReviewBoard from '../src/components/studio-review-board';
const auth=vi.hoisted(()=>({denied:false}));
vi.mock('../src/lib/family-members-server',()=>({memberAuthorization:async()=>auth.denied?new Response('',{status:401}):null,memberBody:(r:Request)=>r.json()}));
import {GET,POST} from '../src/app/api/studio/review/route';
const id='659ef408-0c94-4070-a81c-f054dc02d517';
const sample=()=>({...templateDocument(),title:'Một điều nhỏ',scenes:[{heading:'Cùng nhau',text:'Ghi lại một câu hỏi.'}],sources:[{title:'NHS',url:'https://www.nhs.uk/pregnancy/'}]});
const request=(value:unknown)=>new Request('https://embe.hieu.asia/api/studio/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
beforeEach(()=>{auth.denied=false;vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_SECRET_KEY','test-only');});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('Voice selection',()=>{
  it('defaults only new scripts to Southern voice and rejects paths or uncontrolled speed',()=>{
    expect(templateDocument().voice?.id).toBe('ai-han-south');const old=sample();delete old.voice;expect(studioDocument(old).voice).toBeUndefined();
    for(const voice of [{id:'url',speed:1},{id:'piper',speed:true},{id:'ai-han-south',speed:'1'},{id:'ai-han-south',speed:1,path:'file://x'}])expect(()=>studioDocument({...sample(),voice})).toThrow();
  });
  it('does not auto-play or fetch a preview until explicitly opened',()=>{const changed=vi.fn();render(<StudioVoicePicker value={{id:'ai-han-south',speed:1}} onChange={changed}/>);expect(document.querySelector('audio')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Nghe mẫu Ái Hân'}));expect(document.querySelector('audio')).toHaveAttribute('preload','none');expect(document.querySelector('audio')).not.toHaveAttribute('autoplay');fireEvent.change(screen.getByLabelText('Tốc độ đọc'),{target:{value:'0.95'}});expect(changed).toHaveBeenCalledWith({id:'ai-han-south',speed:.95});});
});
describe('Review boundaries',()=>{
  it('checks authorization before any backend operation',async()=>{auth.denied=true;const fetch=vi.spyOn(globalThis,'fetch');expect((await GET(new Request('https://embe.hieu.asia/api/studio/review'))).status).toBe(401);expect((await POST(request({}))).status).toBe(401);expect(fetch).not.toHaveBeenCalled();});
  it('never accepts approval or publishing via the family account',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');for(const action of ['approve','publish','schedule'])expect((await POST(request({action,id,revision:1,note:''}))).status).toBe(400);expect((await POST(request({action:'request',id,revision:1,note:'',target:'youtube',acknowledged:true,approved:true}))).status).toBe(400);expect(fetch).not.toHaveBeenCalled();
  });
  it('requires a valid target and an explicit video review acknowledgement',async()=>{const fetch=vi.spyOn(globalThis,'fetch');for(const target of ['__proto__','https://evil.test',''])expect((await POST(request({action:'request',id,revision:1,note:'',target,acknowledged:true}))).status).toBe(400);expect((await POST(request({action:'request',id,revision:1,note:'',target:'youtube'}))).status).toBe(400);expect(fetch).not.toHaveBeenCalled();});
  it('preserves database conflicts and sends no user credentials in responses',async()=>{const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:409}));expect((await POST(request({action:'request',id,revision:2,note:'Xem thuật ngữ',target:'youtube',acknowledged:true}))).status).toBe(409);expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({p_action:'request',p_id:id,p_revision:2,p_payload:{note:'Xem thuật ngữ',target:'youtube'}});});
  it('flags dose and absolute language without claiming a clinical verdict',()=>{expect(editorialChecks({...sample(),caption:'Uống 500 mg mỗi ngày, 100% an toàn'})).toHaveLength(2);expect(editorialChecks(sample())).toEqual([]);});
  it('shows connection blockers honestly without a fake publish button',async()=>{
    vi.spyOn(globalThis,'fetch').mockImplementation(async path=>String(path).endsWith('workspace')?Response.json({projects:[]}):Response.json({requests:[]}));
    render(<StudioReviewBoard/>);await waitFor(()=>expect(screen.queryByText('Đang mở hàng chờ…')).toBeNull());expect(screen.getByText('Chưa bật đăng tự động')).toBeInTheDocument();expect(screen.getAllByText('Chưa kết nối')).toHaveLength(5);expect(screen.queryByRole('button',{name:'Đăng ngay'})).toBeNull();
  });
});
