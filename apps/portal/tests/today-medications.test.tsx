import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import TodayMedications,{medicationSlots} from '../src/components/today-medications';
import { LINKED_DAILY_ACTION_EVENT } from '../src/lib/linked-daily-actions';
vi.mock('../src/lib/use-family-data-refresh',()=>({useFamilyDataRefresh:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps dose controls and details in compact mode without repeating pending text',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({snapshot:{plans:[plan]}})));
 const {container}=render(<TodayMedications compact/>);
 await screen.findByText('08:00');
 expect(container.querySelector('.today-medications')).toHaveClass('is-compact');
 expect(screen.getByRole('button',{name:'Đánh dấu đã dùng Thuốc theo đơn lần 2'})).toBeEnabled();
 expect(screen.queryByText('Chưa ghi nhận dùng')).toBeNull();
 expect(screen.getAllByText('Chi tiết thuốc')).toHaveLength(2);
 expect(container.querySelectorAll('.medication-guide[open]')).toHaveLength(0);
 expect(screen.getByRole('progressbar')).toHaveAttribute('value','1');
});
const plan={id:'one',name:'Thuốc theo đơn',dose_display:'1 viên',instructions:'Sau ăn',active:true,times_per_day:2,reminder_times:['08:00:00','20:00:00'],confirmed_by_clinician:true,dose_states:[{slot:1,status:'taken'}]};
it('records the selected slot only after a server receipt',async()=>{
 const linked = vi.fn(); window.addEventListener(LINKED_DAILY_ACTION_EVENT, linked, {once: true});
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  if(init?.method==='PATCH'){
   expect(JSON.parse(String(init.body))).toMatchObject({action:'intake',planId:'one',slot:2,status:'taken',reason:''});
   return Response.json({snapshot:{plans:[{...plan,dose_states:[...plan.dose_states,{slot:2,status:'taken'}]}]},checklistCompletion:{taskId:'supplements',day:'2026-09-09'}});
  }
  return Response.json({snapshot:{plans:[plan]}});
 });vi.stubGlobal('fetch',fetcher);
 render(<TodayMedications/>);
 fireEvent.click(await screen.findByRole('button',{name:'Đánh dấu đã dùng Thuốc theo đơn lần 2'}));
 await screen.findByText('Đã ghi Thuốc theo đơn · lần 2 đã dùng.');
 expect(screen.queryByRole('button',{name:'Đánh dấu đã dùng Thuốc theo đơn lần 2'})).toBeNull();
 expect(linked).toHaveBeenCalledTimes(1);
 expect(linked.mock.calls[0][0].detail).toEqual({taskId:'supplements',day:'2026-09-09'});
});
it('keeps the slot unconfirmed when saving fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init?:RequestInit)=>init?.method==='PATCH'?new Response('{}',{status:503}):Response.json({snapshot:{plans:[plan]}})));
 render(<TodayMedications/>);
 fireEvent.click(await screen.findByRole('button',{name:'Đánh dấu đã dùng Thuốc theo đơn lần 2'}));
 await screen.findByText(/Chưa xác nhận được việc lưu/);
 expect(screen.getByText('Chưa ghi nhận dùng')).toBeInTheDocument();
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
 expect(screen.getAllByText(/Cách dùng & công dụng/)[0].closest('details')).not.toHaveAttribute('open');
 expect(screen.getByText('Chưa ghi nhận dùng')).toBeTruthy();
 expect(fetcher.mock.calls[0][0]).toMatch(/days=0/);
 expect(screen.getByText('08:00').closest('li')).toHaveClass('today-medication');
 expect(screen.getByText('08:00').closest('li')).not.toHaveClass('today-priority');
});
it('offers saved prescriptions instead of marking a dose when no schedule exists',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({snapshot:{plans:[]}})));
 render(<TodayMedications/>);
 await screen.findByText(/Chưa có lịch thuốc đang dùng/);
 expect(screen.getByRole('link',{name:'Xem thuốc từ hồ sơ'})).toHaveAttribute('href','/me-bau/thuoc?quick=prescription');
 expect(screen.queryByRole('link',{name:/Ghi đã uống/})).toBeNull();
});
it('does not present a failed load as no medication',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:503})));
 render(<TodayMedications/>);
 await screen.findByRole('alert');
 expect(screen.queryByText(/Chưa có lịch thuốc đang dùng/)).toBeNull();
});
it('keeps all doses while explaining unconfirmed plans only once and hiding long guidance initially',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({snapshot:{plans:[{...plan,confirmed_by_clinician:false,dose_states:[]}]}})));
 const {container}=render(<TodayMedications/>);
 await screen.findByText('08:00');
 expect(container.querySelectorAll('.today-medication')).toHaveLength(2);
 expect(screen.getAllByText(/Ghi nhận không thay cho xác nhận cách dùng/)).toHaveLength(1);
 expect(screen.getAllByRole('button',{name:/Đánh dấu đã dùng/})).toHaveLength(2);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(container.querySelector('.medication-purpose')).toBeNull();
 expect(screen.getAllByText('Sau ăn')[0]).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Quản lý lịch thuốc'})).toHaveAttribute('href','/me-bau/thuoc');
});
it('records an unconfirmed plan without approving or modifying its prescription',async()=>{
 const unconfirmed={...plan,confirmed_by_clinician:false,entry_source:'clinician_plan',dose_states:[]};
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  if(init?.method==='PATCH'){
   expect(JSON.parse(String(init.body))).toMatchObject({action:'intake',planId:'one',slot:1,status:'taken'});
   expect(JSON.parse(String(init.body))).not.toHaveProperty('confirmedByClinician');
   return Response.json({snapshot:{plans:[{...unconfirmed,dose_states:[{slot:1,status:'taken'}]}]}});
  }
  return Response.json({snapshot:{plans:[unconfirmed]}});
 });vi.stubGlobal('fetch',fetcher);
 render(<TodayMedications/>);
 fireEvent.click(await screen.findByRole('button',{name:'Đánh dấu đã dùng Thuốc theo đơn lần 1'}));
 await screen.findByText('Đã ghi Thuốc theo đơn · lần 1 đã dùng.');
 expect(screen.getByRole('progressbar')).toHaveAttribute('value','1');
 expect(screen.getByRole('button',{name:'Đánh dấu đã dùng Thuốc theo đơn lần 2'})).toBeEnabled();
 expect(screen.getByText(/Ghi nhận không thay cho xác nhận cách dùng/)).toBeInTheDocument();
});
