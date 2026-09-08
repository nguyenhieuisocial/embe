import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import TodayMedications,{medicationSlots} from '../src/components/today-medications';
vi.mock('../src/lib/use-family-data-refresh',()=>({useFamilyDataRefresh:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const plan={id:'one',name:'Thuốc theo đơn',dose_display:'1 viên',instructions:'Sau ăn',active:true,times_per_day:2,reminder_times:['08:00:00','20:00:00'],confirmed_by_clinician:true,dose_states:[{slot:1,status:'taken'}]};
it('shows all daily slots, sorts SQL times and retains unscheduled doses',()=>{
 const rows=medicationSlots([plan,{...plan,id:'two',reminder_times:[],times_per_day:1},{...plan,id:'paused',active:false}]);
 expect(rows.map(row=>row.time)).toEqual(['08:00','20:00','']);
 expect(rows.map(row=>row.status)).toEqual(['taken','pending','taken']);
});
it('loads the current day without fetching health history and displays dose states',async()=>{
 const fetcher=vi.fn(async(_url: string)=>Response.json({snapshot:{plans:[plan]}}));vi.stubGlobal('fetch',fetcher);
 render(<TodayMedications/>);
 await screen.findByText('08:00 · Thuốc theo đơn');
 expect(screen.getByText('20:00 · Thuốc theo đơn')).toBeTruthy();
 expect(screen.getByText('Đã uống')).toBeTruthy();
 expect(screen.getByText('Chưa ghi nhận uống')).toBeTruthy();
 expect(fetcher.mock.calls[0][0]).toMatch(/days=0/);
});
it('does not present a failed load as no medication',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:503})));
 render(<TodayMedications/>);
 await screen.findByRole('alert');
 expect(screen.queryByText(/Chưa có lịch thuốc đang dùng/)).toBeNull();
});
