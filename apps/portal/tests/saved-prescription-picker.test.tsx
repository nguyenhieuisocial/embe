import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import SavedPrescriptionPicker from '../src/components/saved-prescription-picker';
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
it('reports a load error rather than claiming there are no prescriptions',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 render(<SavedPrescriptionPicker onSelect={()=>{}}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải đủ giấy tờ');
});
