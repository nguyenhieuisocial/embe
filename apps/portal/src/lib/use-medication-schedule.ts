"use client";

import {useEffect, useRef, useState} from 'react';
import {dateInVietnam} from './family-task-contract';
import {useFamilyDataRefresh} from './use-family-data-refresh';
import {notifyFamilyDataChanged} from './family-data-refresh';
import {announceLinkedDailyAction} from './linked-daily-actions';

export type MedicationPlan = {id:string;name:string;dose_display:string;instructions:string;active:boolean;times_per_day:number;reminder_times:string[];confirmed_by_clinician:boolean;entry_source?:string;dose_states?:{slot:number;status:string;recorded_at?:string}[]};
export function medicationSlots(plans: MedicationPlan[]) {
  return plans.filter(plan=>plan.active).flatMap(plan=>Array.from({length:Math.min(6,Math.max(1,plan.times_per_day || 1))},(_,index)=>({
    plan, slot:index+1, time:/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(plan.reminder_times?.[index] ?? '') ? plan.reminder_times[index].slice(0,5) : '',
    status:plan.dose_states?.find(state=>state.slot===index+1)?.status ?? 'pending',
  }))).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99') || a.plan.name.localeCompare(b.plan.name,'vi') || a.slot-b.slot);
}

export function medicationRowsForDay(plans: MedicationPlan[], day: string, today: string) {
  // Past days show actual reports only, including paused plans. Today's edited
  // dose/time must not be presented as a historical prescription.
  if(day < today) return plans.flatMap(plan=>(plan.dose_states??[])
    .filter(state=>Number.isInteger(state.slot)&&state.slot>=1&&state.slot<=6&&['taken','skipped','deferred'].includes(state.status))
    .map(state=>({plan,slot:state.slot,time:'',status:state.status})));
  // Future dates are a preview of the current schedule, never a future intake.
  return medicationSlots(plans).map(row=>day>today?{...row,status:'pending'}:row);
}

/** One source of truth for Home, the maternal checklist and the family planner. */
export function useMedicationSchedule(selectedDay?: string) {
  const [plans,setPlans]=useState<MedicationPlan[] | null>(null),[error,setError]=useState(false);
  const [today,setToday]=useState(dateInVietnam);
  const requestedDay=selectedDay??today;
  const [loadedDay,setLoadedDay]=useState('');
  const sequence=useRef(0),writing=useRef(false),mounted=useRef(true);
  const currentDay=useRef(requestedDay); currentDay.current=requestedDay;
  const [saving,setSaving]=useState<string|null>(null),[feedback,setFeedback]=useState('');
  async function load(canApply=()=>true,signal?:AbortSignal){
    const realToday=dateInVietnam();
    const day=selectedDay??realToday;
    if(writing.current&&day===loadedDay)return;
    setToday(realToday);
    const requestId=++sequence.current;
    try {
      const response=await fetch(`/api/pregnancy/care?day=${day}&days=0`,{cache:'no-store',signal});
      if(!response.ok)throw new Error('care');
      const body=await response.json();
      if(!Array.isArray(body.snapshot?.plans))throw new Error('plans');
      if(canApply()&&!signal?.aborted&&requestId===sequence.current){setPlans(body.snapshot.plans);setLoadedDay(day);setError(false);}
    }catch{if(canApply()&&!signal?.aborted&&requestId===sequence.current)setError(true);}
  }
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;sequence.current++;};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    setFeedback('');setError(false);
    void load(()=>true,controller.signal);
    const refresh=()=>{if(document.visibilityState!=='hidden')void load(()=>!controller.signal.aborted,controller.signal);};
    const timer=setInterval(refresh,60000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{controller.abort();sequence.current++;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[selectedDay]);
  useFamilyDataRefresh(canApply=>load(canApply),!saving);

  async function markTaken(plan:MedicationPlan,slot:number){
    if(writing.current||error||loadedDay!==currentDay.current)return;
    if(loadedDay!==dateInVietnam()){
      setFeedback('Ghi nhận đã dùng chỉ dành cho hôm nay. Lịch đang được cập nhật.');void load();return;
    }
    const writeDay=loadedDay;
    writing.current=true;sequence.current++;setSaving(`${plan.id}-${slot}`);setFeedback('');
    try{
      const response=await fetch('/api/pregnancy/care',{method:'PATCH',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'intake',day:writeDay,planId:plan.id,slot,status:'taken',reason:''}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('save');
      const body=await response.json(),next=body.snapshot?.plans as MedicationPlan[]|undefined;
      if(!Array.isArray(next)||!next.some(p=>p.id===plan.id&&p.dose_states?.some(d=>d.slot===slot&&d.status==='taken')))throw new Error('receipt');
      if(mounted.current&&currentDay.current===writeDay){
        setPlans(next);setFeedback(`Đã ghi ${plan.name} · lần ${slot} đã dùng.`);
      }
      announceLinkedDailyAction(body.checklistCompletion);notifyFamilyDataChanged();
    }catch{
      if(mounted.current&&currentDay.current===writeDay){setFeedback('Chưa xác nhận được việc lưu. Hãy thử tải lại lịch trước khi tích lại.');setError(true);}
    }finally{writing.current=false;if(mounted.current)setSaving(null);}
  }
  const visiblePlans=loadedDay===requestedDay?plans:null;
  return {plans:visiblePlans,rows:medicationRowsForDay(visiblePlans??[],requestedDay,today),
    loading:visiblePlans===null&&!error,error,feedback,saving,markTaken,refresh:load,
    day:requestedDay,mode:requestedDay<today?'history':requestedDay>today?'preview':'today'};
}
