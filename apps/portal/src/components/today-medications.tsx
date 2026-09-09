"use client";
import Link from 'next/link';
import MedicationUseGuide from './medication-use-guide';
import {useEffect, useRef, useState} from 'react';
import {dateInVietnam} from '../lib/family-task-contract';
import {useFamilyDataRefresh} from '../lib/use-family-data-refresh';
import {notifyFamilyDataChanged} from '../lib/family-data-refresh';
import {announceLinkedDailyAction} from '../lib/linked-daily-actions';

type Plan = {id:string;name:string;dose_display:string;instructions:string;active:boolean;times_per_day:number;reminder_times:string[];confirmed_by_clinician:boolean;entry_source?:string;dose_states?:{slot:number;status:string}[]};
export function medicationSlots(plans: Plan[]) {
  return plans.filter(plan=>plan.active).flatMap(plan=>Array.from({length:Math.min(12,Math.max(1,plan.times_per_day || 1))},(_,index)=>({
    plan, slot:index+1, time:/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(plan.reminder_times?.[index] ?? '') ? plan.reminder_times[index].slice(0,5) : '',
    status:plan.dose_states?.find(state=>state.slot===index+1)?.status ?? 'pending',
  }))).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99') || a.plan.name.localeCompare(b.plan.name,'vi') || a.slot-b.slot);
}
export default function TodayMedications() {
  const [plans,setPlans]=useState<Plan[] | null>(null),[error,setError]=useState(false);
  const [day,setDay]=useState(dateInVietnam());
  const sequence=useRef(0);
  const writing=useRef(false);
  const [saving,setSaving]=useState<string|null>(null);
  const [feedback,setFeedback]=useState('');
  async function load(canApply=()=>true,signal?:AbortSignal){
    if(writing.current)return;
    const currentDay=dateInVietnam();
    const requestId=++sequence.current;
    try {
      const response=await fetch(`/api/pregnancy/care?day=${currentDay}&days=0`,{cache:'no-store',signal});
      if(!response.ok)throw new Error('care');
      const body=await response.json();
      if(!Array.isArray(body.snapshot?.plans))throw new Error('plans');
      if(canApply()&&!signal?.aborted&&requestId===sequence.current){setPlans(body.snapshot.plans);setDay(currentDay);setError(false);}
    }catch{if(canApply()&&!signal?.aborted&&requestId===sequence.current)setError(true);}
  }
  useEffect(()=>{
    const controller=new AbortController();
    void load(()=>true,controller.signal);
    const refresh=()=>{if(document.visibilityState!=='hidden')void load(()=>!controller.signal.aborted,controller.signal);};
    const timer=setInterval(refresh,60000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  useFamilyDataRefresh(canApply=>load(canApply));
  async function markTaken(plan:Plan,slot:number){
    if(writing.current || error)return;
    if(day!==dateInVietnam()){setFeedback('Đã sang ngày mới. Lịch đang được cập nhật; hãy chọn lại lần uống.');void load();return;}
    writing.current=true;sequence.current++;setSaving(`${plan.id}-${slot}`);setFeedback('');
    try{
      const response=await fetch('/api/pregnancy/care',{method:'PATCH',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'intake',day,planId:plan.id,slot,status:'taken',reason:''}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('save');
      const body=await response.json();
      const next=body.snapshot?.plans as Plan[]|undefined;
      if(!Array.isArray(next)||!next.some(p=>p.id===plan.id&&p.dose_states?.some(d=>d.slot===slot&&d.status==='taken')))throw new Error('receipt');
      setPlans(next);setFeedback(`Đã ghi ${plan.name} · lần ${slot} đã dùng.`);
      announceLinkedDailyAction(body.checklistCompletion);
      notifyFamilyDataChanged();
    }catch{setFeedback('Chưa xác nhận được việc lưu. Hãy thử tải lại lịch trước khi tích lại.');setError(true);}
    finally{writing.current=false;setSaving(null);}
  }
  const rows=medicationSlots(plans??[]);
  const taken=rows.filter(row=>row.status==='taken').length;
  const unconfirmed=(plans??[]).filter(plan=>plan.active&&!plan.confirmed_by_clinician&&plan.entry_source!=='self_purchased').length;
  return <section className="section today-medications" aria-labelledby="today-medicines-title">
    <div className="section-head"><h2 id="today-medicines-title">Thuốc hôm nay</h2><Link className="today-section-link" href="/me-bau/thuoc" aria-label="Quản lý lịch thuốc">Lịch thuốc <span aria-hidden="true">→</span></Link></div>
    {error?<p role="alert">Chưa cập nhật được lịch thuốc. Thông tin cũ, nếu có, chưa phải trạng thái mới nhất. <button className="btn btn-quiet" onClick={()=>void load()}>Thử lại</button></p>:plans===null?<p role="status">Đang tải lịch thuốc…</p>:null}
    {!error&&plans&&!rows.length?<p className="today-medications-empty">Chưa có lịch thuốc đang dùng. Thuốc đã lưu trong hồ sơ vẫn được giữ nguyên.</p>:null}
    {rows.length>0?<div className="today-medications-progress"><span>Đã dùng <strong>{taken}/{rows.length}</strong> lần{error?' · Chưa cập nhật':''}</span><progress max={rows.length} value={taken} aria-label={`Đã ghi nhận dùng ${taken} trên ${rows.length} lần`} /></div>:null}
    {unconfirmed>0?<p className="today-medications-notice">Chỉ tích khi đã dùng thực tế. Ghi nhận không thay cho xác nhận cách dùng với bác sĩ.</p>:null}
    {feedback?<p role="status" aria-live="polite">{feedback}</p>:null}
    <ol className="today-medications-list">{rows.map(({plan,slot,time,status})=><li className="today-medication" data-state={status} key={`${plan.id}-${slot}`}>
      <span className="today-medication-time">{time || 'Chưa đặt giờ'}</span>
      <div className="today-medication-copy">
        <strong>{plan.name}</strong>
        <small>{plan.dose_display || 'Chưa có liều đã ghi'} · lần {slot}/{plan.times_per_day}</small>
      <div className="today-medication-actions">
      {status!=='taken'?<small className="today-medication-state" data-state={status}>{status==='skipped'?'Đã bỏ qua':status==='deferred'?'Đã hoãn':'Chưa ghi nhận dùng'}</small>:null}
      {status==='taken'?<span className="today-medication-check" aria-label={`${plan.name} lần ${slot}: đã dùng`}>✓ Đã dùng</span>
        :<button className="today-medication-check" type="button" disabled={Boolean(saving)||error}
          aria-label={`Đánh dấu đã dùng ${plan.name} lần ${slot}`} onClick={()=>void markTaken(plan,slot)}>{saving===`${plan.id}-${slot}`?'Đang lưu…':<><span aria-hidden="true">○</span> Tích đã dùng</>}</button>}
      </div>
      <MedicationUseGuide name={plan.name} dose={plan.dose_display} instructions={plan.instructions} times={plan.reminder_times??[]} summaryLabel="Cách dùng & công dụng" />
      </div>
    </li>)}</ol>
    {!rows.length?<Link className="btn btn-quiet btn-block" href="/me-bau/thuoc?quick=prescription">Xem thuốc từ hồ sơ</Link>:null}
  </section>;
}
