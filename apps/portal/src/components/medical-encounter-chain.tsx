import Link from 'next/link';
import {medicalEncounters} from '../lib/medical-encounters';
import type {MedicalRecord} from '../lib/pregnancy-medical';
const labels:Record<string,string>={clinical:'Bệnh án',ultrasound:'Siêu âm',laboratory:'Xét nghiệm',prescription:'Đơn thuốc',receipt:'Phiếu thu',discharge:'Giấy ra viện',other:'Giấy tờ khác'};
const day=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa ghi ngày';
export default function MedicalEncounterChain({records}:{records:MedicalRecord[]}){
 const encounters=medicalEncounters(records).filter(e=>e.documents.length||e.followups.length);
 if(!encounters.length)return null;
 return <section aria-label="Chuỗi khám & tái khám" className="medical-encounter-chain">
  <h3>Chuỗi khám & tái khám</h3>
  {encounters.map(encounter=><details key={encounter.id}>
   <summary><span>{encounter.root.documentIntake?'Giấy tờ chưa khớp lần khám':day(encounter.root.occurredAt)}<small>{encounter.root.provider||encounter.root.title}</small></span><small>{encounter.documents.length} giấy tờ</small></summary>
   <p><strong>{encounter.root.title}</strong></p>
   <Link href={`#record-${encounter.root.id}`}>Xem lần khám này</Link>
   <ul aria-label="Giấy tờ trong lần khám">
    {encounter.documents.map(document=><li key={document.id}>
     <Link href={`/me-bau/ho-so/tai-lieu/${document.id}`}>
      {[...new Set(document.detectedKinds??[])].map(kind=>labels[kind]??'Giấy tờ').join(' · ')||'Giấy tờ'}
      <small style={{display:'block'}}>{document.displayName||document.originalFilename}</small>
     </Link>
    </li>)}
   </ul>
   {encounter.followups.length?<div><strong>Tiếp theo · tái khám</strong>
    {encounter.followups.map(event=><p key={event.at}><time dateTime={event.at}>{new Date(event.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</time><br/><Link href="#lich-kham-ke-tiep">Xem lịch hẹn</Link></p>)}
   </div>:null}
  </details>)}
 </section>;
}
