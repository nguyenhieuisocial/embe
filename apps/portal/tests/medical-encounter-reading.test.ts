import {expect,it} from 'vitest';
import {medicalReadingSummary} from '../src/lib/medical-reading-summary';
import {medicalFindingGroups,medicalFindingTopics} from '../src/lib/medical-finding-groups';
import type {DocumentAnalysis} from '../src/lib/medical-document-scan';
import type {MedicalRecord} from '../src/lib/pregnancy-medical';
import {proposeDocumentImport} from '../src/lib/medical-document-import';

const field=(label:string,value:string)=>({label,value,unit:'',reference:'',evidence:value,unclear:true});
const analysis=(index:number):DocumentAnalysis=>({version:1,pages:[{
  page:1,kind:(['receipt','clinical','ultrasound','prescription'] as const)[index],title:'Giấy tờ',warnings:[],charges:[],
  fields:[field(index%2?'Họ và tên':'Họ tên','Nguyễn Thị Ngân'),field('Ngày khám','07/09/2026'),field('Cơ sở khám','Phòng khám Toàn Tâm'),
    field('Số bệnh án',`Mã giấy ${index}`),field('Bác sĩ',`Bác sĩ ${index}`),field(index%2?'Chẩn đoán':'Kết luận','Nội dung giống nhau'),
    {...field('CRL','10'),unit:'mm'}],
  medicines:[{name:'Thuốc mẫu',ingredients:'',dose:'1 viên',frequency:'1 lần/ngày',instructions:'Sau ăn',evidence:'Thuốc mẫu 1 viên 1 lần/ngày sau ăn',unclear:true}],
}]});
const record=(analyses=Array.from({length:4},(_,i)=>analysis(i))):MedicalRecord=>({id:'visit',kind:'clinical',status:'completed',title:'Lần khám',provider:'Phòng khám Toàn Tâm',occurredAt:'2026-09-07',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[],documents:analyses.map((a,i)=>({id:`doc-${i}`,originalFilename:`Giấy ${i}`,createdAt:'2026-09-08',byteSize:1,mimeType:'image/jpeg',readingSummary:medicalReadingSummary(a,false)}))});

it('shows identical data from four same-visit documents once with all four sources',()=>{
  const source=record();const before=JSON.stringify(source);
  for(const category of ['findings','results','medicines'] as const){
    const rows=medicalFindingGroups([source],category);
    expect(rows).toHaveLength(category==='findings'?1:2);
    expect(rows.reduce((sum,row)=>sum+row.sources.length,0)).toBe(4);
    expect(rows[0].row.unclear).toBe(true);
    expect(rows[0].row.sourceDay).toBeUndefined(); // No promotion to a confirmed clinical date.
  }
  expect(JSON.stringify(source)).toBe(before);
});
it('organizes OCR variants within a linked visit without choosing or correcting a diagnosis',()=>{
  const a=analysis(1),b=analysis(1);
  b.pages[0].fields[5].value='Nội dung khác dấu';
  const source=record([a,b]);
  const topics=medicalFindingTopics([source]);
  expect(topics).toHaveLength(1);expect(topics[0].variants).toHaveLength(2);
  expect(topics[0].variants.map(v=>v.row.value)).toEqual(['Nội dung giống nhau','Nội dung khác dấu']);
  b.pages[0].fields[1].value='08/09/2026';
  expect(medicalFindingTopics([record([a,b])])).toHaveLength(2);
});
it('keeps a different person, facility, date or absent identity separate',()=>{
  for(const [index,value] of [[0,'Người khác'],[1,'08/09/2026'],[2,'Bệnh viện khác'],[0,'']] as const){
    const a=analysis(0),b=analysis(1);b.pages[0].fields[index].value=value;
    expect(medicalFindingGroups([record([a,b])])).toHaveLength(2);
  }
});
it('does not hide disagreements in dose, unit, context or conclusions',()=>{
  const a=analysis(0),b=analysis(1);
  b.pages[0].medicines[0].dose='2 viên';
  b.pages[0].fields[6].unit='cm';
  b.pages[0].fields[5].value='Nội dung khác';
  for(const category of ['findings','results','medicines'] as const)
    expect(medicalFindingGroups([record([a,b])],category)).toHaveLength(2);
  b.pages[0].fields[6]={...a.pages[0].fields[6],context:'Sau ăn'};
  expect(medicalFindingGroups([record([a,b])],'results')).toHaveLength(2);
});
it('rejects conflicting PDF identity and ambiguous date evidence for display grouping',()=>{
  const a=analysis(0),b=analysis(1);
  b.pages[0].fields[0].pdfValue='Người khác';
  expect(medicalFindingGroups([record([a,b])])).toHaveLength(2);
  delete b.pages[0].fields[0].pdfValue;
  b.pages[0].fields.push(field('Ngày lập','07/09/2026 và 08/09/2026'));
  expect(medicalFindingGroups([record([a,b])])).toHaveLength(2);
});
it('never imports a receipt quantity as a prescription even when OCR was confirmed',()=>{
  const a=analysis(0);
  a.pages[0].fields.forEach(field=>{field.unclear=false;});
  a.pages[0].medicines[0]={...a.pages[0].medicines[0],dose:'20',unclear:false};
  expect(proposeDocumentImport(a,[],'visit').details.medicines).toEqual([]);
  expect(a.pages[0].medicines).toHaveLength(1);
});
