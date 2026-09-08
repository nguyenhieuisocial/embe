import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import SavedPrescriptionPicker from '../src/components/saved-prescription-picker';
import {refreshFamilyData} from '../src/lib/family-data-refresh';
afterEach(()=>vi.unstubAllGlobals());
it('reuses a saved medicine without an upload or a mutation',async()=>{
 const onSelect=vi.fn();
 const medicine={name:'Thuốc mẫu',dose:'1 viên',frequency:'2 lần/ngày',instructions:'Sau ăn'};
 const fetcher=vi.fn(async()=>Response.json({records:[{id:'record',title:'Đơn đã lưu',kind:'prescription',status:'completed',provider:'',clinician:'',notes:'',occurredAt:'2026-09-08T00:00:00Z',medicines:[medicine],documents:[]}]}));
 vi.stubGlobal('fetch',fetcher);
 render(<SavedPrescriptionPicker onSelect={onSelect}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Dùng thông tin thuốc này'}));
 expect(onSelect).toHaveBeenCalledWith(expect.objectContaining(medicine));
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher).toHaveBeenCalledWith('/api/pregnancy/records',expect.objectContaining({cache:'no-store'}));
 expect(screen.queryByText('Chưa có thuốc trong dữ liệu đã đọc.')).not.toBeInTheDocument();
});
it('refreshes saved prescriptions automatically and removes stale choices on failure',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({records:[{id:'r',kind:'prescription',title:'Đơn',status:'completed',provider:'',clinician:'',notes:'',occurredAt:'2026-09-08T00:00:00Z',medicines:[{name:'Thuốc cũ',dose:'1 viên',frequency:'1 lần/ngày',instructions:''}],documents:[]}]}))
  .mockResolvedValueOnce(new Response('',{status:503}));
 vi.stubGlobal('fetch',fetcher);
 render(<SavedPrescriptionPicker onSelect={()=>{}}/>);
 await screen.findByRole('button',{name:'Dùng thông tin thuốc này'});
 act(()=>refreshFamilyData());
 await screen.findByRole('alert');
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 expect(screen.queryByRole('button',{name:'Dùng thông tin thuốc này'})).not.toBeInTheDocument();
});
it('does not offer receipt quantities stored as medicines as a prescription',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({records:[{id:'r',kind:'receipt',title:'Phiếu thu',status:'completed',provider:'',clinician:'',notes:'',occurredAt:'2026-09-08T00:00:00Z',medicines:[{name:'Sản phẩm mua',dose:'20',frequency:'',instructions:''}],documents:[]}]})));
 render(<SavedPrescriptionPicker onSelect={()=>{}}/>);
 await screen.findByText('Chưa có thuốc trong dữ liệu đã đọc.');
 expect(screen.queryByRole('button',{name:'Dùng thông tin thuốc này'})).not.toBeInTheDocument();
});
it('ignores receipt pages in mixed documents and preserves unresolved prescription warnings',async()=>{
 const medicine={name:'Thuốc trên đơn',ingredients:'',dose:'1 viên',frequency:'1 lần/ngày',instructions:'Sau ăn',evidence:'Theo giấy',unclear:false};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/pregnancy/records'?{records:[{id:'r',kind:'clinical',title:'Lần khám',status:'completed',provider:'',clinician:'',notes:'',occurredAt:'2026-09-08T00:00:00Z',medicines:[],documents:[{id:'d',originalFilename:'Giấy tờ',mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08'}]}]}:{documentId:'d',recordId:'r',status:'confirmed',analysis:{version:1,pages:[
  {page:1,kind:'receipt',title:'Phiếu thu',fields:[],charges:[],warnings:[],medicines:[{...medicine,name:'Sản phẩm trên phiếu thu',dose:'20'}]},
  {page:2,kind:'prescription',title:'Đơn thuốc',fields:[],charges:[],warnings:['Chưa rõ cách dùng'],medicines:[medicine]},
 ]}})));
 const onSelect=vi.fn();render(<SavedPrescriptionPicker onSelect={onSelect}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Dùng thông tin thuốc này'}));
 expect(screen.queryByText('Sản phẩm trên phiếu thu')).not.toBeInTheDocument();
 expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({name:'Thuốc trên đơn',uncertain:true}));
});
it('reports a load error rather than claiming there are no prescriptions',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 render(<SavedPrescriptionPicker onSelect={()=>{}}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải đủ giấy tờ');
});
