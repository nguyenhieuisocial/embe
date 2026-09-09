'use client';
import Link from 'next/link';
import {medicalInsights, type MedicalRecord} from '../lib/pregnancy-medical';
import {MEDICAL_MEASUREMENTS} from '../lib/medical-measurements';
import type {MedicalReadingSummary} from '../lib/medical-reading-summary';
import {medicalFindingGroups,medicalFindingTopics} from '../lib/medical-finding-groups';
import {medicineDisplayGroups,medicineSourceGroups,uniqueMedicineReadings} from '../lib/medicine-display-groups';
import {medicalEncounters} from '../lib/medical-encounters';
import {Icon, type IconName} from './embe-icon';

const date = (value:string) => new Date(value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export function summarizeRecords(records:MedicalRecord[],now=Date.now()) {
  const completed=records.filter(r=>!r.documentIntake&&r.status==='completed'&&Number.isFinite(Date.parse(r.occurredAt))&&Date.parse(r.occurredAt)<=now).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt));
  const clinical=completed.filter(r=>!['receipt','prescription','other'].includes(r.kind));
  const metrics=MEDICAL_MEASUREMENTS.flatMap(metric=>{
    const sources=clinical.filter(r=>typeof r.measurements[metric.key]==='number');
    return sources.length?[{metric,record:sources[0],value:sources[0].measurements[metric.key],previous:sources[1]}]:[];
  });
  return {latest:clinical[0],metrics,prescription:completed.find(r=>r.medicines.length),upcoming:medicalInsights(records,new Date(now)).upcoming};
}
function ReadingSources({sources}:{sources:ReturnType<typeof medicalFindingGroups>[number]['sources']}) {
  return <details><summary>Nguồn đối chiếu <small>{sources.length} trang</small></summary>{sources.map(source=><Link key={`${source.documentId}:${source.page}`} href={`/me-bau/ho-so/tai-lieu/${source.documentId}`}>{source.title} · trang {source.page}</Link>)}</details>;
}
function FindingBody({finding}:{finding:ReturnType<typeof medicalFindingGroups>[number]}) {
  return <><p>{finding.row.value}</p>{finding.row.details.length?<details><summary>Ngữ cảnh bản đọc</summary>{finding.row.details.map((detail,i)=><small key={i}>{detail}</small>)}</details>:null}
    {finding.row.unclear?<small>Bản đọc chưa xác minh</small>:null}<ReadingSources sources={finding.sources}/></>;
}
/** A literal preview of the latest dated encounter, not a new clinical conclusion. */
export function latestRecordReading(records:MedicalRecord[],now=Date.now()) {
  const latest=summarizeRecords(records,now).latest;
  if(!latest)return {highlights:[],conflicts:0};
  const encounter=medicalEncounters(records).find(item=>item.records.some(record=>record.id===latest.id));
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(latest.occurredAt));
  const topics=medicalFindingTopics(encounter?.records??[latest]).filter(topic=>topic.day===day);
  return {highlights:topics.filter(topic=>topic.variants.length===1&&topic.variants[0].row.value.trim()&&topic.variants[0].row.sourceKind!=='receipt').slice(0,2),
    conflicts:topics.filter(topic=>topic.variants.length>1).length};
}
function SummaryLabel({icon,title,meta}:{icon:IconName;title:string;meta:string}) {
  return <><span className={`medical-summary-icon is-${icon}`}><Icon name={icon}/></span><span className="medical-summary-label">{title}<small>{meta}</small></span><Icon name="arrow" className="icon medical-summary-chevron"/></>;
}
export default function PregnancyRecordSummary({records}:{records:MedicalRecord[]}) {
  const summary=summarizeRecords(records);
  const documents=[...new Map(records.flatMap(record=>record.documents).map(document=>[document.id,document])).values()];
  const preview=latestRecordReading(records);
  const findings=medicalFindingTopics(records);
  const allResults=medicalFindingGroups(records,'results');
  const results=allResults.filter(entry=>entry.row.sourceKind!=='receipt');
  const receiptRows=allResults.filter(entry=>entry.row.sourceKind==='receipt');
  const medicines=medicineDisplayGroups(medicalFindingGroups(records,'medicines').filter(entry=>entry.row.sourceKind!=='receipt'),entry=>entry.row.label);
  const count=(group:keyof MedicalReadingSummary)=>documents.reduce((total,document)=>total+(document.readingSummary?.[group].length??0),0);
  const failed=documents.filter(document=>['review','confirmed'].includes(document.scanStatus??'')&&!document.readingSummary);
  return <section className="pregnancy-record-summary" aria-label="Tóm tắt thai kỳ">
    <header><h2>Tóm tắt thai kỳ</h2><small>{documents.length} giấy tờ</small></header>
    <div className="medical-latest-visit">
      <div className="medical-latest-heading"><span><Icon name="care"/>Lần khám gần nhất</span>{summary.latest?<time dateTime={summary.latest.occurredAt}>{date(summary.latest.occurredAt)}</time>:null}</div>
      {summary.latest?<><h3>{summary.latest.title}</h3><p className="medical-latest-provider">{summary.latest.provider || 'Chưa ghi cơ sở khám'}{summary.latest.gestationalWeek?` · Tuần ${summary.latest.gestationalWeek} khi khám`:''}</p>
        {preview.highlights.length?<div className="medical-latest-reading"><small>Trên giấy ghi</small>{preview.highlights.map((item,index)=><div key={index}><p>{item.variants[0].row.value}</p>{item.variants[0].row.unclear?<small>Bản đọc chưa xác minh</small>:null}</div>)}<a href="#ket-luan-ho-so" onClick={()=>document.getElementById('ket-luan-ho-so')?.setAttribute('open','')}>Xem đầy đủ & nguồn</a></div>:<p className="medical-reading-context">{preview.conflicts?'Có bản đọc khác nhau; mở kết luận để xem từng nguồn.':'Mở lần khám để xem giấy tờ và thông tin đã lưu.'}</p>}
        <Link className="medical-latest-link" href={`#record-${summary.latest.id}`}>Xem lần khám<Icon name="arrow"/></Link>
      </>:<><p>Chưa khớp giấy tờ với lần khám.</p><a href="#ho-so-da-luu">Xem giấy tờ đã lưu<Icon name="arrow"/></a></>}
    </div>
    <a className="medical-summary-appointment" href="#lich-kham-ke-tiep"><span className="medical-summary-icon is-calendar"><Icon name="calendar"/></span><span><small>Lịch tiếp theo</small><strong>{summary.upcoming?`${date(summary.upcoming.occurredAt)} · ${new Date(summary.upcoming.occurredAt).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'})}`:'Chưa có lịch hẹn'}</strong>{summary.upcoming?.provider?<small>{summary.upcoming.provider}</small>:null}</span><Icon name="arrow"/></a>
    {failed.length?<p role="alert">{failed.length} bản đọc chưa tải được; tổng hợp chưa đầy đủ. {failed.map(document=><Link key={document.id} href={`/me-bau/ho-so/tai-lieu/${document.id}`}>{document.displayName||document.originalFilename}</Link>)}</p>:null}
    <details id="ket-luan-ho-so"><summary><SummaryLabel icon="guide" title="Kết luận & lời dặn" meta={`${findings.length} nội dung trên giấy`}/></summary>
      <p className="medical-reading-context">Thông tin từ giấy tờ, không thay kết luận bác sĩ.</p>
      {!count('findings')?<p>Chưa lấy được kết luận từ bản đọc. Không có nghĩa kết quả khám bình thường.</p>:null}
      {findings.map((finding,index)=><article key={index}>
        <strong>{finding.label}</strong>{finding.day?<small>{finding.day.split('-').reverse().join('/')}</small>:null}
        {finding.variants.length===1?<FindingBody finding={finding.variants[0]}/>:<details>
          <summary>{finding.variants.length} bản đọc khác nhau</summary>
          <small>Chưa chọn một bản làm kết luận chung.</small>
          {finding.variants.map((variant,i)=><div key={i}><FindingBody finding={variant}/></div>)}
        </details>}
      </article>)}
    </details>
    <details><summary><SummaryLabel icon="room" title="Kết quả & chỉ số" meta={`${results.length} mục trên giấy · ${summary.metrics.length} chỉ số đã lưu`}/></summary>
      <p>Giữ nguyên số và đơn vị trên giấy; bản đọc chưa xác minh không dùng để kết luận sức khỏe.</p>
      {!count('results')?<p>Chưa có kết quả trong bản đọc đã tải.</p>:null}
      {results.map(({row,sources},index)=><article key={index}>
        <strong>{row.label}</strong><p>{row.value}</p>{row.details.map((detail,i)=><small key={i}>{detail}</small>)}
        {row.unclear?<small>Bản đọc chưa xác minh</small>:null}
        <ReadingSources sources={sources}/>
      </article>)}
      <details><summary>Chỉ số mới nhất đã lưu <small>{summary.metrics.length} chỉ số</small></summary>
        {!summary.metrics.length?<p>Chưa có chỉ số được nhập vào hồ sơ; số trên ảnh có thể chưa đồng bộ.</p>:null}
        <dl>{summary.metrics.map(({metric,record,value,previous})=><div key={metric.key}><dt>{metric.label}</dt><dd><strong>{value} {metric.unit}</strong> · {date(record.occurredAt)}{previous?<small>Lần trước: {previous.measurements[metric.key]} {metric.unit} · {date(previous.occurredAt)}</small>:null}<Link href={`#record-${record.id}`}>Nguồn số đo</Link></dd></div>)}</dl>
      </details>
    </details>
    <details><summary><SummaryLabel icon="supply" title="Thuốc trong giấy tờ" meta={`${medicines.length} tên thuốc đã đọc`}/></summary>
      <p>Thuốc và cách dùng tự lấy từ hồ sơ, không cần tải lại đơn. Đây chưa phải lịch thuốc đang uống.</p>
      {!count('medicines')?<p>Chưa có thuốc trong bản đọc đã tải.</p>:null}
      {medicines.map(group=><details key={group.name}>
        <summary>{group.name}</summary>
        {medicineSourceGroups(group.rows,entry=>JSON.stringify(entry.sources.map(s=>[s.documentId,s.page]).sort())).map(raw=>({...raw,rows:uniqueMedicineReadings(raw.rows,entry=>[entry.row.value,...entry.row.details.slice().sort()],(a,b)=>({...a,row:{...a.row,unclear:a.row.unclear||b.row.unclear}}))})).map(source=><article key={source.source}>
          <ReadingSources sources={source.rows[0].sources}/>
          {source.rows.length>1?<details><summary>{source.rows.length} bản đọc cách dùng trên cùng giấy tờ</summary>
            {source.rows.map(({row},index)=><div key={index}><strong>Bản đọc {index+1}</strong><p>{row.value || 'Chưa đọc rõ liều/cách dùng'}</p>{row.details.map((detail,i)=><small key={i}>{detail}</small>)}{row.unclear?<small>Bản đọc chưa xác minh</small>:null}</div>)}
          </details>:source.rows.map(({row},index)=><div key={index}>
          <p>{row.value || 'Chưa đọc rõ liều/cách dùng'}</p>{row.details.map((detail,i)=><small key={i}>{detail}</small>)}
          {row.unclear?<small>Bản đọc chưa xác minh</small>:null}
          </div>)}
        </article>)}
      </details>)}
      {summary.prescription?<details><summary>Thuốc đã nhập vào hồ sơ</summary><p>{date(summary.prescription.occurredAt)} · Không đồng nghĩa đang uống.</p>{summary.prescription.medicines.map((medicine,index)=><p key={index}><strong>{medicine.name}</strong> — {[medicine.dose,medicine.frequency,medicine.instructions].filter(Boolean).join(' · ')}</p>)}</details>:null}
      <Link href="/me-bau/thuoc?quick=prescription">Thuốc & lịch uống</Link>
    </details>
    {receiptRows.length?<details><summary><SummaryLabel icon="album" title="Phiếu thu & dịch vụ" meta={`${receiptRows.length} mục trên giấy`}/></summary>
      <p>Số lượng mua/cấp phát không phải liều uống.</p>
      {receiptRows.map((entry,index)=><article key={index}><strong>{entry.row.label}</strong><FindingBody finding={entry}/></article>)}
    </details>:null}
    <details className="medical-document-progress"><summary><SummaryLabel icon="refresh" title="Trạng thái giấy tờ" meta={`${documents.filter(document=>document.imported).length}/${documents.length} đã nhập dữ liệu`}/></summary>
      {documents.map(document=><article key={document.id}>
        <Link href={`/me-bau/ho-so/tai-lieu/${document.id}`}>{document.displayName||document.originalFilename}</Link>
        <small>{document.imported?'Đã nhập dữ liệu vào hồ sơ':document.scanStatus==='failed'?'Đọc tài liệu bị lỗi · mở để thử lại':document.scanStatus==='processing'?'Đang đọc tài liệu':document.scanStatus==='queued'?'Đang chờ xử lý':['review','confirmed'].includes(document.scanStatus??'')?'Có bản đọc · chưa nhập dữ liệu vào hồ sơ':'Chưa đọc · mở tài liệu để kiểm tra'}</small>
      </article>)}
    </details>
  </section>;
}
