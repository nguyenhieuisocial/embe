'use client';
import { useEffect, useRef, useState } from 'react';
import type { StudioVoice } from '../lib/studio-project';

type SampleVoice = Exclude<StudioVoice['id'],'piper'|'auto-south'>;
const names:Record<SampleVoice,string> = {'thuc-doan-south-v3':'Thục Đoan','thuy-dung-south-v3':'Thùy Dung','thuc-doan-south-v2':'Thục Đoan','my-duyen-south-v2':'Mỹ Duyên','kim-thanh-south-v2':'Kim Thanh','thuc-doan-south-v1':'Thục Đoan (bản trước)','my-duyen-south-v1':'Mỹ Duyên (bản trước)','ai-han-south':'Ái Hân'};
function SamplePlayer({voice,speed}:{voice:SampleVoice;speed:StudioVoice['speed']}) {
  const [open,setOpen]=useState(false),[failed,setFailed]=useState(false);
  const audio=useRef<HTMLAudioElement>(null);
  useEffect(()=>{
    const current=audio.current;
    return ()=>{if(current){current.pause();current.removeAttribute('src');current.load();}};
  },[open]);
  return <div className="studio-voice-sample">
    {!open ? <button type="button" className="discovery-button" onClick={()=>setOpen(true)}>Nghe mẫu {names[voice]}</button> : <>
      <audio ref={audio} controls preload="none" aria-label={`Nghe giọng nữ miền Nam ${names[voice]}`}
        src={`/api/studio/voice-preview?voice=${voice}`} onLoadedMetadata={()=>{if(audio.current){audio.current.preservesPitch=true;audio.current.playbackRate=speed;}}} onError={()=>setFailed(true)}/>
      {failed&&<p role="alert">Chưa tải được mẫu. <button type="button" className="discovery-button" onClick={()=>{setFailed(false);audio.current?.load();}}>Thử tải lại</button></p>}
    </>}
  </div>;
}

export function SouthernVoiceSample({voice,speed=1}:{voice?:SampleVoice;speed?:StudioVoice['speed']}){
  const [comparison,setComparison]=useState<SampleVoice>('thuc-doan-south-v3');
  const selected=voice??comparison;
  return <div>
    {!voice&&<label className="studio-filter">Giọng nghe thử<select value={comparison} onChange={e=>setComparison(e.target.value as SampleVoice)}>
      <optgroup label="Bản nâng cấp"><option value="thuc-doan-south-v3">Thục Đoan · kể chuyện</option><option value="thuy-dung-south-v3">Thùy Dung · thuyết minh</option></optgroup>
      <optgroup label="Nhịp đọc trước"><option value="thuc-doan-south-v2">Thục Đoan</option><option value="my-duyen-south-v2">Mỹ Duyên</option><option value="kim-thanh-south-v2">Kim Thanh</option></optgroup>
      <optgroup label="So sánh bản trước"><option value="thuc-doan-south-v1">Thục Đoan (bản trước)</option><option value="my-duyen-south-v1">Mỹ Duyên (bản trước)</option><option value="ai-han-south">Ái Hân</option></optgroup>
    </select></label>}
    <SamplePlayer key={`${selected}:${speed}`} voice={selected} speed={speed}/>
    {!voice&&<p className="discovery-help">Cùng một đoạn để so sánh giọng mới và bản trước. Không tự phát âm thanh.</p>}
  </div>;
}

export default function StudioVoicePicker({value,onChange}:{value?:StudioVoice;onChange:(v:StudioVoice)=>void}){
  const selected=value??{id:'piper',speed:1};
  const automatic=selected.id==='auto-south';
  const legacy=!automatic&&!selected.id.endsWith('-v3');
  return <section className="studio-voice-panel" aria-label="Giọng đọc">
    <h2>{automatic?'Giọng đọc tự động':'Giọng đọc đã chọn'}</h2>
    <p className="discovery-help">{automatic?'Nữ miền Nam · đọc rõ chữ viết tắt · nghỉ giữa các ý · cân âm lượng cho điện thoại. Tự áp dụng cho video mới.':'Giữ giọng bạn đã chọn; video lịch sử không bị thay đổi.'}</p>
    {automatic&&<SouthernVoiceSample voice="thuc-doan-south-v3"/>}
    <details className="studio-disclosure"><summary>Tùy chỉnh giọng nếu muốn</summary>
    <label className="studio-filter">Chọn giọng<select value={selected.id} onChange={e=>onChange({...selected,id:e.target.value as StudioVoice['id']})}>
      <option value="auto-south">Tự động · nữ miền Nam</option>
      <optgroup label="Bản nâng cấp"><option value="thuc-doan-south-v3">Thục Đoan · kể chuyện</option><option value="thuy-dung-south-v3">Thùy Dung · thuyết minh</option></optgroup>
      <optgroup label="Nữ miền Nam · nhịp đọc mới"><option value="thuc-doan-south-v2">Thục Đoan · kể chuyện</option><option value="my-duyen-south-v2">Mỹ Duyên · đọc truyện</option><option value="kim-thanh-south-v2">Kim Thanh · đọc truyện</option></optgroup>
      <optgroup label="Giọng bản trước"><option value="thuc-doan-south-v1">Thục Đoan (bản trước)</option><option value="my-duyen-south-v1">Mỹ Duyên (bản trước)</option><option value="ai-han-south">Ái Hân · Nano thử nghiệm</option><option value="piper">Giọng Việt cũ · Piper</option></optgroup>
    </select></label>
    {!automatic&&<label className="studio-filter">Tốc độ đọc<select value={selected.speed} onChange={e=>onChange({...selected,speed:Number(e.target.value) as StudioVoice['speed']})}><option value={.95}>Thong thả · 0,95×</option><option value={1}>Bình thường · 1×</option><option value={1.05}>Nhanh nhẹ · 1,05×</option></select></label>}
    {!automatic&&selected.id!=='piper'&&<SouthernVoiceSample voice={selected.id as SampleVoice} speed={selected.speed}/>}
    {legacy&&<p className="discovery-help">Bản nháp giữ giọng trước đây. Đổi sang “Tự động” để dùng nhịp đọc mới; video lịch sử giữ nguyên.</p>}
    <p className="discovery-help">Chỉnh tay là tùy chọn. Giọng AI không phải Mẹ Ngân; tự động dựng không thay duyệt nội dung trước khi đăng.</p>
    </details>
  </section>;
}
