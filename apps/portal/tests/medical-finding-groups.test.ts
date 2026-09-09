import {it,expect} from 'vitest';
import {medicalFindingGroups,medicalFindingTopics,bundleFindingReadings} from '../src/lib/medical-finding-groups';
import type {MedicalRecord} from '../src/lib/pregnancy-medical';
const row={page:1,label:'Kết luận',value:'Nội dung giống nhau',details:[],unclear:false,sourceDay:'2026-09-07',sourceIdentity:'patient-A'};
const document=(id:string)=>({id,originalFilename:id,mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08',readingSummary:{findings:[{...row}],medicines:[],results:[]}});
const record:MedicalRecord={id:'r',kind:'clinical',status:'completed',title:'',occurredAt:'2026-09-07',provider:'',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[],documents:[document('a'),document('b')]};
it('bundles five accent-only readings for display but keeps five originals and uncertainty',()=>{
 const input=structuredClone(record);input.documents=[document('a')];
 input.documents[0].readingSummary!.findings=['NỘI DUNG MẪU 50%','NÓI DUNG MẪU 50%','NỌI DUNG MẪU 50%','NÔI DUNG MẪU 50%','NOI DUNG MAU 50%'].map(value=>({...row,value,unclear:true}));
 const topics=medicalFindingTopics([input]),before=JSON.stringify(topics);
 const bundles=bundleFindingReadings(topics[0].variants);
 expect(bundles).toHaveLength(1);expect(bundles[0]).toHaveLength(5);
 expect(topics[0].variants).toHaveLength(5);expect(JSON.stringify(topics)).toBe(before);
});
it('does not bundle differing numbers, negation, operators, case-sensitive units or people',()=>{
 const base=medicalFindingGroups([record])[0];
 for(const [a,b] of [['50%','40%'],['Có dịch','Không có dịch'],['< 5','> 5'],['5 mM','5 mm'],['1,5','15']]){
  expect(bundleFindingReadings([{...base,row:{...row,value:a}},{...base,row:{...row,value:b}}])).toHaveLength(2);
 }
 expect(bundleFindingReadings([base,{...base,row:{...base.row,sourceIdentity:'other'}}])).toHaveLength(2);
 expect(bundleFindingReadings([base,{...base,row:{...base.row,sourceDay:'2026-09-08'}}])).toHaveLength(2);
});
it('bundles the same instruction with an OCR accent or arrow glyph difference',()=>{
 const base=medicalFindingGroups([record])[0];
 expect(bundleFindingReadings([{...base,row:{...row,value:'Đau bụng =—> khám ngay'}},{...base,row:{...row,value:'Dau bụng ==> khám ngay'}}])).toHaveLength(1);
});
it('groups identical same-day text and preserves every source and label',()=>{
 const input=structuredClone(record);input.documents[1].readingSummary!.findings[0].label='Chẩn đoán';
 const groups=medicalFindingGroups([input]);expect(groups).toHaveLength(1);expect(groups[0].sources).toHaveLength(2);expect(groups[0].labels).toEqual(['Kết luận','Chẩn đoán']);
 expect(input.documents).toHaveLength(2);
});
it('keeps different dates and contents separate',()=>{
 const input=structuredClone(record);input.documents[1].readingSummary!.findings[0].sourceDay='2026-09-08';expect(medicalFindingGroups([input])).toHaveLength(2);
 input.documents[1].readingSummary!.findings[0]={...row,value:'Nội dung khác'};expect(medicalFindingGroups([input])).toHaveLength(2);
});
it('does not merge unknown dates across documents or use upload day',()=>{
 const input=structuredClone(record);input.documents.forEach(d=>{d.readingSummary!.findings[0].sourceDay=undefined;});expect(medicalFindingGroups([input])).toHaveLength(2);
});
it('preserves context and uncertainty without changing the source',()=>{
 const input=structuredClone(record);input.documents[1].readingSummary!.findings[0].unclear=true;expect(medicalFindingGroups([input])[0].row.unclear).toBe(true);expect(input.documents[0].readingSummary!.findings[0].unclear).toBe(false);
 input.documents[1].readingSummary!.findings[0].details=['Ngữ cảnh khác'];expect(medicalFindingGroups([input])).toHaveLength(1);
});
it('does not repeat a conclusion under another label because OCR explanations differ',()=>{
 const input=structuredClone(record);
 input.documents[0].readingSummary!.findings[0].details=['Ngữ cảnh A'];
 input.documents[1].readingSummary!.findings[0]={...row,label:'Chẩn đoán',details:['Ngữ cảnh B',' Ngữ cảnh A '],unclear:true};
 const before=JSON.stringify(input),topics=medicalFindingTopics([input]);
 expect(topics).toHaveLength(1);expect(topics[0].variants).toHaveLength(1);
 expect(topics[0].variants[0].sources).toHaveLength(2);
 expect(topics[0].variants[0].row.details).toHaveLength(2);
 expect(topics[0].variants[0].labels).toEqual(['Kết luận','Chẩn đoán']);
 expect(JSON.stringify(input)).toBe(before);
});
it('deduplicates reordered result context but retains different times, units, signs and values',()=>{
 const input=structuredClone(record);
 input.documents.forEach((d,i)=>{d.readingSummary!.results=[{...row,label:'Glucose',value:'5 mmol/L',details:i?['Tham chiếu: 4–6','Lúc đói']:['Lúc đói','Tham chiếu: 4–6','Lúc đói']}];});
 expect(medicalFindingGroups([input],'results')).toHaveLength(1);
 const second=input.documents[1].readingSummary!.results[0];
 second.details=['Sau ăn','Tham chiếu: 4–6'];expect(medicalFindingGroups([input],'results')).toHaveLength(2);
 second.details=['Lúc đói','Tham chiếu: 4–6'];
 for(const value of ['6 mmol/L','5 mg/dL','< 5 mmol/L']){second.value=value;expect(medicalFindingGroups([input],'results')).toHaveLength(2);}
});
it('never merges topic readings from different explicit patients or facilities',()=>{
 const input=structuredClone(record);
 input.documents[1].readingSummary!.findings[0].sourceIdentity='patient-B';
 expect(medicalFindingTopics([input])[0].variants).toHaveLength(2);
 input.documents.forEach((d,i)=>{d.readingSummary!.findings[0]={...row,displayEncounter:`patient-A:clinic-${i}`};});
 expect(medicalFindingTopics([input])[0].variants).toHaveLength(2);
});
it('does not merge different medical records',()=>{expect(medicalFindingGroups([record,{...record,id:'other'}])).toHaveLength(2);});
it('shows identical topic text once despite different OCR context and retains sources',()=>{
 const input=structuredClone(record);
 input.documents[0].readingSummary!.findings[0].details=['Ngữ cảnh A'];
 input.documents[1].readingSummary!.findings[0].details=['Ngữ cảnh B'];
 input.documents[1].readingSummary!.findings[0].unclear=true;
 const before=JSON.stringify(input);
 const topic=medicalFindingTopics([input])[0];
 expect(topic.variants).toHaveLength(1);
 expect(topic.variants[0].sources).toHaveLength(2);
 expect(topic.variants[0].row.details).toEqual(['Ngữ cảnh A','Ngữ cảnh B']);
 expect(topic.variants[0].row.unclear).toBe(true);
 expect(JSON.stringify(input)).toBe(before);
});
it('does not collapse medical spelling differences or different days into one reading',()=>{
 const input=structuredClone(record);
 input.documents[1].readingSummary!.findings[0].value='Nội dung khác';
 expect(medicalFindingTopics([input])[0].variants).toHaveLength(2);
 input.documents[1].readingSummary!.findings[0]={...row,sourceDay:'2026-09-08'};
 expect(medicalFindingTopics([input])).toHaveLength(2);
});
it('keeps different or missing patient identities separate',()=>{
 const input=structuredClone(record);input.documents[1].readingSummary!.findings[0].sourceIdentity='patient-B';expect(medicalFindingGroups([input])).toHaveLength(2);
 input.documents.forEach(d=>{d.readingSummary!.findings[0].sourceIdentity=undefined;});expect(medicalFindingGroups([input])).toHaveLength(2);
});
