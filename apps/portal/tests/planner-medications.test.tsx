import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import FamilyPlanner from '../src/components/family-planner';
import {dateInVietnam} from '../src/lib/family-task-contract';
import {medicationRowsForDay,type MedicationPlan} from '../src/lib/use-medication-schedule';
import {refreshFamilyData} from '../src/lib/family-data-refresh';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const today=dateInVietnam();
const plan:MedicationPlan={id:'11111111-1111-4111-8111-111111111111',name:'Thuốc mẫu theo đơn',dose_display:'Liều mẫu',instructions:'Lời dặn gốc',
  active:true,times_per_day:2,reminder_times:['08:00:00','20:00:00'],confirmed_by_clinician:false,entry_source:'clinician_plan',dose_states:[]};
const task={id:'12',occurrenceOn:today,startsOn:today,title:'Lịch hẹn mẫu',note:'',ownerRole:'family',category:'appointment',linkTarget:'pregnancy',dueTime:'09:30',repeatRule:'none',completed:false};

it('automatically interleaves each dose with tasks, includes progress and writes only to the original intake',async()=>{
 let states:MedicationPlan['dose_states']=[];
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.startsWith('/api/pregnancy/care')){
   if(init?.method==='PATCH'){
    expect(JSON.parse(String(init.body))).toEqual({action:'intake',day:today,planId:plan.id,slot:1,status:'taken',reason:''});
    states=[{slot:1,status:'taken'}];
   }
   return Response.json({snapshot:{plans:[{...plan,dose_states:states}]}});
  }
  return Response.json({tasks:[task]});
 });vi.stubGlobal('fetch',fetcher);
 const {container}=render(<FamilyPlanner selectedDate={today}/>);
 await screen.findByText('0/3 việc đã xong');
 expect([...container.querySelectorAll('.planner-task-body > strong')].map(el=>el.textContent)).toEqual([plan.name,task.title,plan.name]);
 expect(screen.queryByText('Ngày này đang thật nhẹ')).not.toBeInTheDocument();
 expect(container.querySelectorAll('.planner-medication details[open]')).toHaveLength(0);
 expect(fetcher.mock.calls.filter(([,init])=>init?.method)).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:`Đánh dấu đã dùng ${plan.name} lần 1`}));
 await screen.findByText('1/3 việc đã xong');
 expect(screen.getByRole('button',{name:`Đánh dấu đã dùng ${plan.name} lần 2`})).toBeEnabled();
 expect(fetcher.mock.calls.filter(([url,init])=>url==='/api/tasks'&&init?.method)).toHaveLength(0);
 expect(screen.getByText(`Đã ghi ${plan.name} · lần 1 đã dùng.`)).toBeInTheDocument();
});

it('does not complete a dose or double-submit while its receipt is pending, and supports retry after failure',async()=>{
 let finish:(response:Response)=>void=()=>{};
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='PATCH'
  ?new Promise<Response>(resolve=>{finish=resolve;})
  :Response.json(url.startsWith('/api/pregnancy/care')?{snapshot:{plans:[plan]}}:{tasks:[]}));
 vi.stubGlobal('fetch',fetcher);
 render(<FamilyPlanner selectedDate={today}/>);
 await screen.findByText('0/2 việc đã xong');
 const button=screen.getByRole('button',{name:`Đánh dấu đã dùng ${plan.name} lần 1`});
 fireEvent.click(button);fireEvent.click(button);
 expect(button).toBeDisabled();
 expect(screen.getByText('0/2 việc đã xong')).toBeInTheDocument();
 await act(async()=>finish(Response.json({error:'unavailable'},{status:503})));
 await screen.findByText(/Chưa xác nhận được việc lưu/);
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH')).toHaveLength(1);
 expect(screen.getByText('Chưa cập nhật đủ')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Tải lại thuốc'}));
 await waitFor(()=>expect(button).toBeEnabled());
 expect(screen.getByText('0/2 việc đã xong')).toBeInTheDocument();
});

it('does not show a false empty day if medicine loading fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.startsWith('/api/pregnancy/care')?new Response('{}',{status:503}):Response.json({tasks:[]})));
 render(<FamilyPlanner selectedDate={today}/>);
 await screen.findByRole('button',{name:'Tải lại thuốc'});
 expect(screen.queryByText('Ngày này đang thật nhẹ')).not.toBeInTheDocument();
 expect(screen.queryByText('0/0 việc đã xong')).not.toBeInTheDocument();
});

it('refreshes medication changes without losing a task draft or creating another task',async()=>{
 let active=true;
 const fetcher=vi.fn(async(url:string,_init?:RequestInit)=>Response.json(url.startsWith('/api/pregnancy/care')?{snapshot:{plans:[{...plan,active}]}}:{tasks:[]}));
 vi.stubGlobal('fetch',fetcher);
 render(<FamilyPlanner selectedDate={today}/>);
 await screen.findByText('0/2 việc đã xong');
 fireEvent.click(screen.getByRole('button',{name:'Thêm việc mới'}));
 fireEvent.change(screen.getByLabelText('Việc cần làm'),{target:{value:'Bản nháp chưa lưu'}});
 active=false;
 act(()=>refreshFamilyData());
 await screen.findByText('0/0 việc đã xong');
 expect(screen.getByLabelText('Việc cần làm')).toHaveValue('Bản nháp chưa lưu');
 expect(fetcher.mock.calls.filter(([,init])=>init?.method&&init.method!=='GET')).toHaveLength(0);
});

it('shows future doses only as read-only previews',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.startsWith('/api/pregnancy/care')?{snapshot:{plans:[{...plan,dose_states:[{slot:1,status:'taken'}]}]}}:{tasks:[]})));
 render(<FamilyPlanner selectedDate="2100-01-01"/>);
 await screen.findByText('0/2 việc đã xong');
 expect(screen.getAllByText('Chưa đến ngày ghi nhận')).toHaveLength(2);
 expect(screen.queryByRole('button',{name:/Đánh dấu đã dùng/})).not.toBeInTheDocument();
});

it('uses actual past reports including paused plans, without projecting current dose or time backwards',async()=>{
 const past={...plan,active:false,dose_states:[{slot:2,status:'taken'}]};
 expect(medicationRowsForDay([plan,past],'2026-09-01','2026-09-09')).toEqual([{plan:past,slot:2,time:'',status:'taken'}]);
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.startsWith('/api/pregnancy/care')?{snapshot:{plans:[past]}}:{tasks:[]})));
 render(<FamilyPlanner selectedDate="2020-01-01"/>);
 await screen.findByText('1/1 việc đã xong');
 expect(screen.queryByText(plan.dose_display)).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Đánh dấu đã dùng/})).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Xem lịch sử dùng thuốc'})).toHaveAttribute('href','/me-bau/thuoc');
});

it('discards a response from the previously selected date',async()=>{
 let resolveOld:(value:Response)=>void=()=>{};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url.includes('day=2020-01-01'))return new Promise<Response>(resolve=>{resolveOld=resolve;});
  return Response.json(url.startsWith('/api/pregnancy/care')?{snapshot:{plans:[plan]}}:{tasks:[]});
 }));
 const view=render(<FamilyPlanner selectedDate="2020-01-01"/>);
 view.rerender(<FamilyPlanner selectedDate={today}/>);
 await screen.findByText('0/2 việc đã xong');
 await act(async()=>resolveOld(Response.json({snapshot:{plans:[]}})));
 expect(screen.getByText('0/2 việc đã xong')).toBeInTheDocument();
});
