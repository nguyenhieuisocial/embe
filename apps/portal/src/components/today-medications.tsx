"use client";
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {dateInVietnam} from '../lib/family-task-contract';
import {useFamilyDataRefresh} from '../lib/use-family-data-refresh';

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
  async function load(canApply=()=>true,signal?:AbortSignal){
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
  const rows=medicationSlots(plans??[]);
  return <section className="section today-medications" aria-labelledby="today-medicines-title">
    <div className="section-head"><h2 id="today-medicines-title">Thuốc hôm nay</h2><small>{day.split('-').reverse().join('/')}</small></div>
    {error?<p role="alert">Chưa cập nhật được lịch thuốc. Thông tin cũ, nếu có, chưa phải trạng thái mới nhất. <button className="btn btn-quiet" onClick={()=>void load()}>Thử lại</button></p>:plans===null?<p role="status">Đang tải lịch thuốc…</p>:null}
    {!error&&plans&&!rows.length?<p className="today-medications-empty">Chưa có lịch thuốc đang dùng. Thuốc đã lưu trong hồ sơ vẫn được giữ nguyên.</p>:null}
    <ol className="today-medications-list">{rows.map(({plan,slot,time,status})=><li className="today-medication" key={`${plan.id}-${slot}`}>
      <span className="today-medication-copy">
        <strong>{time || 'Chưa có giờ uống'} · {plan.name}</strong>
        <small>{plan.dose_display || 'Chưa có liều đã ghi'} · lần {slot}/{plan.times_per_day}</small>
        {plan.instructions?<small>{plan.instructions}</small>:null}
        {!plan.confirmed_by_clinician&&plan.entry_source!=='self_purchased'?<small>Chưa xác nhận kế hoạch với bác sĩ</small>:null}
        <small className="today-medication-state" data-state={status}>{status==='taken'?'Đã uống':status==='skipped'?'Đã bỏ qua':status==='deferred'?'Đã hoãn':'Chưa ghi nhận uống'}</small>
      </span>
    </li>)}</ol>
    <Link className="btn btn-quiet btn-block" href={rows.length?'/me-bau/suc-khoe-iphone#vi-chat-thuoc':'/me-bau/suc-khoe-iphone?quick=prescription#vi-chat-thuoc'}>{rows.length?'Ghi đã uống · Quản lý lịch thuốc':'Xem thuốc từ hồ sơ'}</Link>
  </section>;
}
