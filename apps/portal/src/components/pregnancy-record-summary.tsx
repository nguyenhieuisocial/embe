'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {medicalInsights, type MedicalRecord} from '../lib/pregnancy-medical';
import {MEDICAL_MEASUREMENTS} from '../lib/medical-measurements';
import {validDocumentAnalysis} from '../lib/medical-document-scan';
import {groupDocumentData} from '../lib/medical-document-data';
import {medicalDocumentName} from '../lib/medical-document-name';

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
type Finding={documentId:string;title:string;label:string;value:string;unclear:boolean;page:number};
export default function PregnancyRecordSummary({records}:{records:MedicalRecord[]}) {
  const summary=summarizeRecords(records);
  const [findings,setFindings]=useState<Finding[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(0);
  const documents=records.flatMap(record=>record.documents);
  const ids=JSON.stringify([...new Set(documents.map(d=>d.id))]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setFindings([]);setFailed(0);
    void(async()=>{
      const result:Finding[]=[];let errors=0;const documentIds:string[]=JSON.parse(ids);
      for(let offset=0;offset<documentIds.length;offset+=3){
        if(controller.signal.aborted)return;
        const batches=await Promise.all(documentIds.slice(offset,offset+3).map(async documentId=>{
          try{
            const response=await fetch(`/api/pregnancy/documents/${documentId}/scan`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
            if(!response.ok)throw new Error('scan');const scan=await response.json();
            if(scan.documentId!==documentId)throw new Error('identity');
            if(!['review','confirmed'].includes(scan.status))return [];
            if(!validDocumentAnalysis(scan.analysis))throw new Error('analysis');
            const title=medicalDocumentName([scan.analysis]);
            return groupDocumentData(scan.analysis).findings.map(row=>({documentId,title,label:row.label,value:row.value,unclear:row.unclear||scan.status!=='confirmed',page:row.page}));
          }catch{errors++;return [];}
        }));result.push(...batches.flat());
      }
      if(!controller.signal.aborted){setFindings(result);setFailed(errors);setLoading(false);}
    })();return()=>controller.abort();
  },[ids,records]);
  return <section className="pregnancy-record-summary" aria-label="Tóm tắt thai kỳ">
    <header><h2>Tóm tắt thai kỳ</h2><small>Theo hồ sơ đã lưu · không thay kết luận bác sĩ</small></header>
    <div className="pregnancy-summary-lead">
      <div><span>Lần khám gần nhất đã ghi</span>{summary.latest?<><strong>{date(summary.latest.occurredAt)} · {summary.latest.title}</strong><p>{summary.latest.provider || 'Chưa ghi cơ sở khám'}</p><Link href={`#record-${summary.latest.id}`}>Xem lần khám</Link></>:<p>Chưa có lần khám hoàn tất được khớp. Giấy tờ vẫn được giữ bên dưới.</p>}</div>
      <div><span>Lịch tiếp theo</span>{summary.upcoming?<><strong>{date(summary.upcoming.occurredAt)} · {summary.upcoming.title}</strong><Link href={`#record-${summary.upcoming.id}`}>Xem lịch hẹn</Link></>:<p>Chưa có lịch hẹn sắp tới được lưu.</p>}</div>
    </div>
    <details><summary>Kết luận & lời dặn trên giấy <small>{loading?'Đang đọc…':`${findings.length} mục`}</small></summary>
      {failed>0?<p role="alert">{failed} tài liệu chưa tải được; tổng hợp chưa đầy đủ.</p>:null}
      {!loading&&!findings.length?<p>Chưa lấy được kết luận từ bản đọc. Không có nghĩa kết quả khám bình thường.</p>:null}
      {findings.map((row,index)=><article key={`${row.documentId}:${index}`}><strong>{row.label}</strong><p>{row.value}</p>{row.unclear?<small>Bản đọc chưa xác minh · cần kiểm tra nguồn</small>:null}<Link href={`/me-bau/ho-so/tai-lieu/${row.documentId}`}>{row.title} · trang {row.page}</Link></article>)}
    </details>
    <details><summary>Chỉ số mới nhất đã lưu <small>{summary.metrics.length} chỉ số</small></summary>
      {!summary.metrics.length?<p>Chưa có chỉ số được nhập vào hồ sơ; số trên ảnh có thể chưa đồng bộ.</p>:null}
      <dl>{summary.metrics.map(({metric,record,value,previous})=><div key={metric.key}><dt>{metric.label}</dt><dd><strong>{value} {metric.unit}</strong> · {date(record.occurredAt)}{previous?<small>Lần trước: {previous.measurements[metric.key]} {metric.unit} · {date(previous.occurredAt)}</small>:null}<Link href={`#record-${record.id}`}>Nguồn số đo</Link></dd></div>)}</dl>
    </details>
    <details><summary>Thuốc trong hồ sơ gần nhất</summary>{summary.prescription?<><p>{date(summary.prescription.occurredAt)} · Không đồng nghĩa đang uống.</p>{summary.prescription.medicines.map((medicine,index)=><p key={index}><strong>{medicine.name}</strong> — {[medicine.dose,medicine.frequency,medicine.instructions].filter(Boolean).join(' · ')}</p>)}</>:<p>Chưa có thuốc được nhập từ đơn vào hồ sơ.</p>}<Link href="/me-bau/suc-khoe-iphone?quick=prescription#vi-chat-thuoc">Xem thuốc & lịch uống</Link></details>
    <footer>{documents.length} giấy tờ · {documents.filter(d=>!['confirmed','review'].includes(d.scanStatus??'')).length} chưa có bản đọc · {documents.filter(d=>!d.imported).length} chưa nhập dữ liệu vào hồ sơ</footer>
  </section>;
}
