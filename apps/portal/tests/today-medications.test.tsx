import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import TodayMedications,{medicationSlots} from '../src/components/today-medications';
vi.mock('../src/lib/use-family-data-refresh',()=>({useFamilyDataRefresh:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const plan={id:'one',name:'Thuốc theo đơn',dose_display:'1 viên',instructions:'Sau ăn',active:true,times_per_day:2,reminder_times:['08:00:00','20:00:00'],confirmed_by_clinician:true,dose_states:[{slot:1,status:'taken'}]};
it('records the selected slot only after a server receipt',async()=>{
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  if(init?.method==='PATCH'){
   expect(JSON.parse(String(init.body))).toMatchObject({action:'intake',planId:'one',slot:2,status:'taken',reason:''});
   return Response.json({snapshot:{plans:[{...plan,dose_states:[...plan.dose_states,{slot:2,status:'taken'}]}]}});
  }
  return Response.json({snapshot:{plans:[plan]}});
 });vi.stubGlobal('fetch',fetcher);
 render(<TodayMedications/>);
 fireEvent.click(await screen.findByRole('button',{name:'Đánh dấu đã uống Thuốc theo đơn lần 2'}));
 await screen.findByText('Đã ghi Thuốc theo đơn · lần 2 đã uống.');
 expect(screen.queryByRole('button',{name:'Đánh dấu đã uống Thuốc theo đơn lần 2'})).toBeNull();
});
it('keeps the slot unconfirmed when saving fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init?:RequestInit)=>init?.method==='PATCH'?new Response('{}',{status:503}):Response.json({snapshot:{plans:[plan]}})));
 render(<TodayMedications/>);
 fireEvent.click(await screen.findByRole('button',{name:'Đánh dấu đã uống Thuốc theo đơn lần 2'}));
 await screen.findByText(/Chưa xác nhận được việc lưu/);
 expect(screen.getByText('Chưa ghi nhận uống')).toBeInTheDocument();
});
it('shows all daily slots, sorts SQL times and retains unscheduled doses',()=>{
 const rows=medicationSlots([plan,{...plan,id:'two',reminder_times:[],times_per_day:1},{...plan,id:'paused',active:false}]);
 expect(rows.map(row=>row.time)).toEqual(['08:00','20:00','']);
 expect(rows.map(row=>row.status)).toEqual(['taken','pending','taken']);
});
it('loads the current day without fetching health history and displays dose states',async()=>{
 const fetcher=vi.fn(async(_url: string)=>Response.json({snapshot:{plans:[plan]}}));vi.stubGlobal('fetch',fetcher);
 render(<TodayMedications/>);
 await screen.findByText('08:00');
 expect(screen.getByText('20:00')).toBeTruthy();
 expect(screen.getByRole('progressbar')).toHaveAttribute('value','1');
 expect(screen.getAllByText('Cách dùng')[0].closest('details')).not.toHaveAttribute('open');
 expect(screen.getByText('Chưa ghi nhận uống')).toBeTruthy();
 expect(fetcher.mock.calls[0][0]).toMatch(/days=0/);
 expect(screen.getByText('08:00').closest('li')).toHaveClass('today-medication');
 expect(screen.getByText('08:00').closest('li')).not.toHaveClass('today-priority');
});
it('offers saved prescriptions instead of marking a dose when no schedule exists',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({snapshot:{plans:[]}})));
 render(<TodayMedications/>);
 await screen.findByText(/Chưa có lịch thuốc đang dùng/);
 expect(screen.getByRole('link',{name:'Xem thuốc từ hồ sơ'})).toHaveAttribute('href','/me-bau/suc-khoe-iphone?quick=prescription#vi-chat-thuoc');
 expect(screen.queryByRole('link',{name:/Ghi đã uống/})).toBeNull();
});
it('does not present a failed load as no medication',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:503})));
 render(<TodayMedications/>);
 await screen.findByRole('alert');
 expect(screen.queryByText(/Chưa có lịch thuốc đang dùng/)).toBeNull();
});
