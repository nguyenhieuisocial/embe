"use client";
import Link from 'next/link';
import MedicationUseGuide from './medication-use-guide';
import {useMedicationSchedule} from '../lib/use-medication-schedule';
export {medicationSlots} from '../lib/use-medication-schedule';

export default function TodayMedications({compact=false}:{compact?:boolean}={}) {
  const {plans,rows,error,saving,feedback,markTaken,refresh:load}=useMedicationSchedule();
  const taken=rows.filter(row=>row.status==='taken').length;
  const unconfirmed=(plans??[]).filter(plan=>plan.active&&!plan.confirmed_by_clinician&&plan.entry_source!=='self_purchased').length;
  return <section className={`section today-medications${compact?' is-compact':''}`} aria-labelledby="today-medicines-title">
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
      {status!=='taken'&&(!compact||status==='skipped'||status==='deferred')?<small className="today-medication-state" data-state={status}>{status==='skipped'?'Đã bỏ qua':status==='deferred'?'Đã hoãn':'Chưa ghi nhận dùng'}</small>:null}
      {status==='taken'?<span className="today-medication-check" aria-label={`${plan.name} lần ${slot}: đã dùng`}>✓ Đã dùng</span>
        :<button className="today-medication-check" type="button" disabled={Boolean(saving)||error}
          aria-label={`Đánh dấu đã dùng ${plan.name} lần ${slot}`} onClick={()=>void markTaken(plan,slot)}>{saving===`${plan.id}-${slot}`?'Đang lưu…':<><span aria-hidden="true">○</span> Tích đã dùng</>}</button>}
      </div>
      <MedicationUseGuide name={plan.name} dose={plan.dose_display} instructions={plan.instructions} times={plan.reminder_times??[]} summaryLabel={compact?'Chi tiết thuốc':'Cách dùng & công dụng'} />
      </div>
    </li>)}</ol>
    {!rows.length?<Link className="btn btn-quiet btn-block" href="/me-bau/thuoc?quick=prescription">Xem thuốc từ hồ sơ</Link>:null}
  </section>;
}
