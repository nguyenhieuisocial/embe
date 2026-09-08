'use client';
import Link from 'next/link';
import {medicalInsights, type MedicalRecord} from '../lib/pregnancy-medical';
import {MEDICAL_MEASUREMENTS} from '../lib/medical-measurements';
import type {MedicalReadingSummary} from '../lib/medical-reading-summary';
import {medicalFindingGroups,medicalFindingTopics} from '../lib/medical-finding-groups';
import {medicineDisplayGroups} from '../lib/medicine-display-groups';

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
  return <><p>{finding.row.value}</p>{finding.row.details.map((detail,i)=><small key={i}>{detail}</small>)}
    {finding.row.unclear?<small>Bản đọc chưa xác minh</small>:null}<ReadingSources sources={finding.sources}/></>;
}
export default function PregnancyRecordSummary({records}:{records:MedicalRecord[]}) {
  const summary=summarizeRecords(records);
  const documents=records.flatMap(record=>record.documents);
  const findings=medicalFindingTopics(records);
  const allResults=medicalFindingGroups(records,'results');
  const results=allResults.filter(entry=>entry.row.sourceKind!=='receipt');
  const receiptRows=allResults.filter(entry=>entry.row.sourceKind==='receipt');
  const medicines=medicineDisplayGroups(medicalFindingGroups(records,'medicines').filter(entry=>entry.row.sourceKind!=='receipt'),entry=>entry.row.label);
  const count=(group:keyof MedicalReadingSummary)=>documents.reduce((total,document)=>total+(document.readingSummary?.[group].length??0),0);
  const failed=documents.filter(document=>['review','confirmed'].includes(document.scanStatus??'')&&!document.readingSummary);
  return <section className="pregnancy-record-summary" aria-label="Tóm tắt thai kỳ">
    <header><h2>Tóm tắt thai kỳ</h2><small>Theo hồ sơ đã lưu · không thay kết luận bác sĩ</small></header>
    <div className="pregnancy-summary-lead">
      <div><span>Lần khám gần nhất đã ghi</span>{summary.latest?<><strong>{date(summary.latest.occurredAt)} · {summary.latest.title}</strong><p>{summary.latest.provider || 'Chưa ghi cơ sở khám'}</p><Link href={`#record-${summary.latest.id}`}>Xem lần khám</Link></>:<p>Chưa có lần khám hoàn tất được khớp. Giấy tờ vẫn được giữ bên dưới.</p>}</div>
      <div><span>Lịch tiếp theo</span>{summary.upcoming?<><strong>{date(summary.upcoming.occurredAt)} · {summary.upcoming.title}</strong><Link href="#lich-kham-ke-tiep" onClick={()=>document.getElementById('lich-kham-ke-tiep')?.setAttribute('open','')}>Xem lịch hẹn</Link></>:<p>Chưa có lịch hẹn sắp tới được lưu.</p>}</div>
    </div>
    {failed.length?<p role="alert">{failed.length} bản đọc chưa tải được; tổng hợp chưa đầy đủ. {failed.map(document=><Link key={document.id} href={`/me-bau/ho-so/tai-lieu/${document.id}`}>{document.displayName||document.originalFilename}</Link>)}</p>:null}
    <details><summary>Kết luận & lời dặn trên giấy <small>{findings.length} nội dung</small></summary>
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
    <details><summary>Kết quả & chỉ số trên giấy <small>{results.length} mục</small></summary>
      <p>Giữ số, đơn vị và thời điểm theo từng tài liệu; chưa dùng bản đọc chưa xác minh để kết luận sức khỏe.</p>
      {!count('results')?<p>Chưa có kết quả trong bản đọc đã tải.</p>:null}
      {results.map(({row,sources},index)=><article key={index}>
        <strong>{row.label}</strong><p>{row.value}</p>{row.details.map((detail,i)=><small key={i}>{detail}</small>)}
        {row.unclear?<small>Bản đọc chưa xác minh</small>:null}
        <ReadingSources sources={sources}/>
      </article>)}
    </details>
    <details><summary>Thuốc đã đọc từ giấy tờ <small>{medicines.length} tên thuốc</small></summary>
      <p>Thuốc và cách dùng tự lấy từ hồ sơ, không cần tải lại đơn. Đây chưa phải lịch thuốc đang uống.</p>
      {!count('medicines')?<p>Chưa có thuốc trong bản đọc đã tải.</p>:null}
      {medicines.map(group=><details key={group.name}>
        <summary>{group.name} <small>{group.rows.length} bản thông tin</small></summary>
        {group.rows.length>1?<small>Các bản dưới đây được giữ riêng; không cộng liều giữa các đơn.</small>:null}
        {group.rows.map(({row,sources},index)=><article key={index}>
          <p>{row.value || 'Chưa đọc rõ liều/cách dùng'}</p>{row.details.map((detail,i)=><small key={i}>{detail}</small>)}
          {row.unclear?<small>Bản đọc chưa xác minh</small>:null}
          <ReadingSources sources={sources}/>
        </article>)}
      </details>)}
      <Link href="/me-bau/suc-khoe-iphone?quick=prescription#vi-chat-thuoc">Thuốc & lịch uống</Link>
    </details>
    {receiptRows.length?<details><summary>Phiếu thu · dịch vụ & số lượng <small>{receiptRows.length} mục</small></summary>
      <p>Số lượng mua/cấp phát không phải liều uống.</p>
      {receiptRows.map((entry,index)=><article key={index}><strong>{entry.row.label}</strong><FindingBody finding={entry}/></article>)}
    </details>:null}
    <details><summary>Chỉ số mới nhất đã lưu <small>{summary.metrics.length} chỉ số</small></summary>
      {!summary.metrics.length?<p>Chưa có chỉ số được nhập vào hồ sơ; số trên ảnh có thể chưa đồng bộ.</p>:null}
      <dl>{summary.metrics.map(({metric,record,value,previous})=><div key={metric.key}><dt>{metric.label}</dt><dd><strong>{value} {metric.unit}</strong> · {date(record.occurredAt)}{previous?<small>Lần trước: {previous.measurements[metric.key]} {metric.unit} · {date(previous.occurredAt)}</small>:null}<Link href={`#record-${record.id}`}>Nguồn số đo</Link></dd></div>)}</dl>
    </details>
    <details><summary>Thuốc trong hồ sơ gần nhất</summary>{summary.prescription?<><p>{date(summary.prescription.occurredAt)} · Không đồng nghĩa đang uống.</p>{summary.prescription.medicines.map((medicine,index)=><p key={index}><strong>{medicine.name}</strong> — {[medicine.dose,medicine.frequency,medicine.instructions].filter(Boolean).join(' · ')}</p>)}</>:<p>Chưa có thuốc được nhập từ đơn vào hồ sơ.</p>}<Link href="/me-bau/suc-khoe-iphone?quick=prescription#vi-chat-thuoc">Xem thuốc & lịch uống</Link></details>
    <details className="medical-document-progress"><summary>Trạng thái giấy tờ <small>{documents.length} tài liệu</small></summary>
      {documents.map(document=><article key={document.id}>
        <Link href={`/me-bau/ho-so/tai-lieu/${document.id}`}>{document.displayName||document.originalFilename}</Link>
        <small>{document.imported?'Đã nhập dữ liệu vào hồ sơ':document.scanStatus==='failed'?'Đọc tài liệu bị lỗi · mở để thử lại':document.scanStatus==='processing'?'Đang đọc tài liệu':document.scanStatus==='queued'?'Đang chờ xử lý':['review','confirmed'].includes(document.scanStatus??'')?'Có bản đọc · chưa nhập dữ liệu vào hồ sơ':'Chưa đọc · mở tài liệu để kiểm tra'}</small>
      </article>)}
    </details>
  </section>;
}
