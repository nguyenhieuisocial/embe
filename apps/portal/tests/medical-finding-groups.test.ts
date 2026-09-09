import {it,expect} from 'vitest';
import {medicalFindingGroups,medicalFindingTopics} from '../src/lib/medical-finding-groups';
import type {MedicalRecord} from '../src/lib/pregnancy-medical';
const row={page:1,label:'Kết luận',value:'Nội dung giống nhau',details:[],unclear:false,sourceDay:'2026-09-07',sourceIdentity:'patient-A'};
const document=(id:string)=>({id,originalFilename:id,mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08',readingSummary:{findings:[{...row}],medicines:[],results:[]}});
const record:MedicalRecord={id:'r',kind:'clinical',status:'completed',title:'',occurredAt:'2026-09-07',provider:'',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[],documents:[document('a'),document('b')]};
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
 input.documents[1].readingSummary!.findings[0].details=['Ngữ cảnh khác'];expect(medicalFindingGroups([input])).toHaveLength(2);
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
