'use client';
import { useState } from 'react';
import type { StudioVoice } from '../lib/studio-project';
export function SouthernVoiceSample(){
  const [open,setOpen]=useState(false),[failed,setFailed]=useState(false);
  return <div className="studio-voice-sample">{!open?<button type="button" className="discovery-button" onClick={()=>setOpen(true)}>Nghe mẫu Ái Hân</button>:<><audio controls preload="none" aria-label="Nghe giọng nữ miền Nam Ái Hân" src="/api/studio/voice-preview" onError={()=>setFailed(true)}/><p className="discovery-help">Nhấn phát để nghe. Không tự phát âm thanh.</p>{failed&&<p role="alert">Chưa tải được mẫu. <a href="/api/studio/voice-preview">Mở bản nghe thử</a></p>}</>}</div>;
}
export default function StudioVoicePicker({value,onChange}:{value?:StudioVoice;onChange:(v:StudioVoice)=>void}){
  const selected=value??{id:'piper',speed:1};
  return <section className="studio-voice-panel" aria-label="Giọng đọc">
    <h2>Giọng đọc</h2>
    <label className="studio-filter">Chọn giọng<select value={selected.id} onChange={e=>onChange({...selected,id:e.target.value as StudioVoice['id']})}><option value="ai-han-south">Ái Hân · nữ miền Nam</option><option value="piper">Giọng Việt cũ · Piper</option></select></label>
    <label className="studio-filter">Tốc độ đọc<select value={selected.speed} onChange={e=>onChange({...selected,speed:Number(e.target.value) as StudioVoice['speed']})}><option value={.95}>Thong thả · 0,95×</option><option value={1}>Tự nhiên · 1×</option><option value={1.05}>Nhanh nhẹ · 1,05×</option></select></label>
    {selected.id==='ai-han-south'&&<><SouthernVoiceSample/><p className="discovery-help">Giọng AI thử nghiệm, không phải giọng Mẹ Ngân. Nghe lại tên riêng và thuật ngữ y tế trong video trước khi đăng.</p></>}
    <p className="discovery-help">Đổi giọng hoặc tốc độ cần lưu và dựng lại. Video cũ được giữ nguyên.</p>
  </section>;
}
