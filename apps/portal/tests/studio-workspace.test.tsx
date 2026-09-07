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
  it('requires the current saved revision but not a fake clinical acknowledgement to render a draft',async()=>{f.rpc.mockResolvedValueOnce({status:200,data:{project:{revision:2,payload:sample()}}});expect((await POST(request({action:'render',id,revision:1}))).status).toBe(409);expect(f.rpc).toHaveBeenCalledTimes(1);
    f.rpc.mockResolvedValueOnce({status:200,data:{project:{revision:2,payload:sample()}}}).mockResolvedValueOnce({status:200,data:{render:{status:'queued'}}});
    expect((await POST(request({action:'render',id,revision:2}))).status).toBe(200);
    expect(f.rpc).toHaveBeenLastCalledWith('render',id,2,null);
  });
  it('saves through existing private API and exposes conflict honestly',async()=>{f.rpc.mockResolvedValue({status:409,data:null});expect((await POST(request({action:'save',id,revision:1,payload:sample()}))).status).toBe(409);expect(f.rpc).toHaveBeenCalledWith('save',id,1,sample());});
});
describe('Editor and share workflow',()=>{
  it('clears temporary edits after saving a newly created project again',async()=>{
    vi.spyOn(window.history,'replaceState').mockImplementation(()=>{});
    let revision=0;
    vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{const body=JSON.parse(String(init?.body));return Response.json({project:{id:body.id,revision:++revision,payload:body.payload,deleted:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}});});
    render(<StudioEditor/>);
    fireEvent.change(screen.getByLabelText('Tên nội dung'),{target:{value:'Bản mới'}});
    fireEvent.click(screen.getByRole('button',{name:'Lưu bản nháp'}));await screen.findByRole('button',{name:'Đã lưu'});
    fireEvent.change(screen.getByLabelText('Tên nội dung'),{target:{value:'Đã sửa lần hai'}});
    expect(sessionStorage.length).toBe(1);expect(sessionStorage.getItem('embe:studio-editor:new')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Lưu bản nháp'}));await screen.findByRole('button',{name:'Đã lưu'});
    expect(sessionStorage.length).toBe(0);expect(revision).toBe(2);
  });
  it('preserves edits after a failed save and never queues stale content',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'down'},{status:503}));render(<StudioEditor/>);fireEvent.change(screen.getByLabelText('Tên nội dung'),{target:{value:'Bản đang viết'}});fireEvent.click(screen.getByRole('button',{name:'Lưu bản nháp'}));await screen.findByText(/Chưa kết nối được Studio/);expect(screen.getByLabelText('Tên nội dung')).toHaveValue('Bản đang viết');expect(sessionStorage.getItem('embe:studio-editor:new')).toContain('Bản đang viết');expect(screen.queryByRole('button',{name:'Dựng video có giọng Việt'})).toBeNull();});
  it('keeps legacy projects unchanged on view and never queues unsaved edits',async()=>{
    let count=0;vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{count++;return Response.json({project:{id,revision:1,payload:sample(),deleted:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},renders:[],workerSeenAt:null});});
    render(<StudioEditor projectId={id}/>);await screen.findByDisplayValue('Một điều nhỏ');expect(screen.getByRole('button',{name:'Dựng video có giọng Việt'})).toBeEnabled();expect(count).toBe(1);
    fireEvent.change(screen.getByLabelText('Lời đọc cảnh 1'),{target:{value:'Bản thay đổi chưa lưu'}});expect(screen.queryByRole('button',{name:'Dựng video có giọng Việt'})).toBeNull();expect(count).toBe(1);
  });
  it('autosaves edits without a save/render click and enables durable rendering',async()=>{
    vi.spyOn(window.history,'replaceState').mockImplementation(()=>{});
    const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{const body=JSON.parse(String(init?.body));return Response.json({project:{id:body.id,revision:1,payload:body.payload,deleted:false}});});
    render(<StudioEditor/>);expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Tên nội dung'),{target:{value:'Tự lưu'}});
    await waitFor(()=>expect(fetch).toHaveBeenCalledOnce(),{timeout:3000});
    const body=JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.action).toBe('save');expect(body.payload.voice).toEqual({id:'auto-south',speed:1});expect(body.payload.autoRender).toBe(true);
    await screen.findByRole('button',{name:'Đã lưu'});expect(sessionStorage.length).toBe(0);
  });
  it('does not overwrite typing that happens during an automatic save',async()=>{
    vi.spyOn(window.history,'replaceState').mockImplementation(()=>{});
    let finish:((r:Response)=>void)|undefined;let payload:unknown;let target='';
    vi.spyOn(globalThis,'fetch').mockImplementation((_url,init)=>{const body=JSON.parse(String(init?.body));payload=body.payload;target=body.id;return new Promise(resolve=>{finish=resolve;});});
    render(<StudioEditor/>);fireEvent.change(screen.getByLabelText('Tên nội dung'),{target:{value:'Bản đầu'}});
    await waitFor(()=>expect(finish).toBeDefined(),{timeout:3000});
    expect(screen.getByLabelText('Tên nội dung')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Tên nội dung'),{target:{value:'Bản mới đang gõ'}});
    finish!(Response.json({project:{id:target,revision:1,payload,deleted:false}}));
    await screen.findByText('Đã lưu trên EmBe.');
    expect(screen.getByLabelText('Tên nội dung')).toHaveValue('Bản mới đang gõ');
    expect(sessionStorage.getItem(`embe:studio-editor:${target}`)).toContain('Bản mới đang gõ');
    expect([...Array(sessionStorage.length)].map((_,i)=>sessionStorage.getItem(sessionStorage.key(i)!)).join()).toContain('Bản mới đang gõ');
  });
  it('prepares a bounded file before a separate share gesture and does not claim publication',async()=>{
    const share=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:share});
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'video/mp4'}}));
    render(<StudioFileShare url="/api/studio/a/video" title="EmBe" filename="embe.mp4"/>);fireEvent.click(screen.getByRole('button',{name:'Chuẩn bị chia sẻ'}));await screen.findByRole('button',{name:'Chia sẻ file video'});expect(share).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Chia sẻ file video'}));await waitFor(()=>expect(share).toHaveBeenCalledOnce());expect(share.mock.calls[0][0].files[0].name).toBe('embe.mp4');await screen.findByText(/chưa xác nhận bài đã được đăng/);
  });
});
