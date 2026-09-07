import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {studioDocument,templateDocument,readyToRender} from '../src/lib/studio-project';
import {studioTopics} from '../src/lib/studio';
import {StudioEditor} from '../src/components/studio-workspace';
import StudioFileShare from '../src/components/studio-file-share';
const f=vi.hoisted(()=>({denied:false,rpc:vi.fn()}));
vi.mock('../src/lib/family-members-server',()=>({memberAuthorization:async()=>f.denied?new Response('denied',{status:401}):null}));
vi.mock('../src/lib/studio-workspace-server',()=>({workspaceRpc:f.rpc,workspacePublic:(v:unknown)=>v,workspaceFailure:(s:number)=>Response.json({error:'failed'},{status:s})}));
import {GET,POST} from '../src/app/api/studio/workspace/route';
const id='659ef408-0c94-4070-a81c-f054dc02d517';
const sample=()=>({title:'Một điều nhỏ',stage:'Mẹ bầu',caption:'Caption',scenes:[{heading:'Cùng nhau',text:'Ghi lại một câu hỏi trước lần khám tiếp theo.'}],sources:[{title:'NHS',url:'https://www.nhs.uk/pregnancy/'}]});
const request=(body:unknown)=>new Request('https://embe.hieu.asia/api/studio/workspace',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{f.denied=false;f.rpc.mockReset();sessionStorage.clear();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('Studio workspace boundaries',()=>{
  it('validates all templates and never silently truncates medical text',()=>{for(const topic of studioTopics())expect(studioDocument(templateDocument(topic)).scenes).toHaveLength(topic.beats.length);});
  it('keeps unfinished drafts but blocks rendering until scenes and sources exist',()=>{expect(readyToRender(studioDocument(templateDocument()))).toBe(false);expect(readyToRender(studioDocument(sample()))).toBe(true);});
  it('rejects bad document types, long scenes and unsafe source links',()=>{for(const value of [{...sample(),scenes:[]},{...sample(),title:44},{...sample(),sources:[{title:'X',url:'javascript:alert(1)'}]},{...sample(),scenes:[{heading:'ok',text:'x'.repeat(181)}]}])expect(()=>studioDocument(value)).toThrow();expect(studioDocument({...sample(),sources:[{title:'NHS',url:'https://www.nhs.uk/pregnancy/?token=SECRET'}]}).sources[0].url).not.toContain('SECRET');});
  it('denies access before RPC for reads and writes',async()=>{f.denied=true;expect((await GET(new Request('https://embe.hieu.asia/api/studio/workspace'))).status).toBe(401);expect((await POST(request({}))).status).toBe(401);expect(f.rpc).not.toHaveBeenCalled();});
  it('rejects unsupported actions and unknown fields in script',async()=>{expect((await POST(request({action:'worker',revision:0,id}))).status).toBe(400);expect((await POST(request({action:'save',revision:0,id,payload:{...sample(),raw_path:'C:/Anh'}}))).status).toBe(400);expect(f.rpc).not.toHaveBeenCalled();});
  it('checks saved revision and acknowledgement before render',async()=>{expect((await POST(request({action:'render',id,revision:1}))).status).toBe(400);f.rpc.mockResolvedValue({status:200,data:{project:{revision:2,payload:sample()}}});expect((await POST(request({action:'render',id,revision:1,acknowledged:true}))).status).toBe(409);expect(f.rpc).toHaveBeenCalledTimes(1);});
  it('saves through existing private API and exposes conflict honestly',async()=>{f.rpc.mockResolvedValue({status:409,data:null});expect((await POST(request({action:'save',id,revision:1,payload:sample()}))).status).toBe(409);expect(f.rpc).toHaveBeenCalledWith('save',id,1,sample());});
});
describe('Editor and share workflow',()=>{
  it('preserves edits after a failed save and never queues stale content',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'down'},{status:503}));render(<StudioEditor/>);fireEvent.change(screen.getByLabelText('Tên nội dung'),{target:{value:'Bản đang viết'}});fireEvent.click(screen.getByRole('button',{name:'Lưu bản nháp'}));await screen.findByText(/Chưa kết nối được Studio/);expect(screen.getByLabelText('Tên nội dung')).toHaveValue('Bản đang viết');expect(sessionStorage.getItem('embe:studio-editor:new')).toContain('Bản đang viết');expect(screen.queryByRole('button',{name:'Dựng video có giọng Việt'})).toBeNull();});
  it('separates save from explicit render and offers revision conflict recovery',async()=>{
    let count=0;vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{count++;return Response.json({project:{id,revision:1,payload:sample(),deleted:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},renders:[],workerSeenAt:null});});
    render(<StudioEditor projectId={id}/>);await screen.findByDisplayValue('Một điều nhỏ');expect(screen.getByRole('button',{name:'Dựng video có giọng Việt'})).toBeDisabled();expect(count).toBe(1);
    fireEvent.click(screen.getByRole('checkbox'));expect(screen.getByRole('button',{name:'Dựng video có giọng Việt'})).toBeEnabled();fireEvent.change(screen.getByLabelText('Lời đọc cảnh 1'),{target:{value:'Bản thay đổi chưa lưu'}});expect(screen.getByRole('button',{name:'Dựng video có giọng Việt'})).toBeDisabled();expect(count).toBe(1);
  });
  it('prepares a bounded file before a separate share gesture and does not claim publication',async()=>{
    const share=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:share});
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'video/mp4'}}));
    render(<StudioFileShare url="/api/studio/a/video" title="EmBe" filename="embe.mp4"/>);fireEvent.click(screen.getByRole('button',{name:'Chuẩn bị chia sẻ'}));await screen.findByRole('button',{name:'Chia sẻ file video'});expect(share).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Chia sẻ file video'}));await waitFor(()=>expect(share).toHaveBeenCalledOnce());expect(share.mock.calls[0][0].files[0].name).toBe('embe.mp4');await screen.findByText(/chưa xác nhận bài đã được đăng/);
  });
});
