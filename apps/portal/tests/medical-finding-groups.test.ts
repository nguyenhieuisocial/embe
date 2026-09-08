import {it,expect} from 'vitest';
import {medicalFindingGroups} from '../src/lib/medical-finding-groups';
import type {MedicalRecord} from '../src/lib/pregnancy-medical';
const row={page:1,label:'Kết luận',value:'Nội dung giống nhau',details:[],unclear:false,sourceDay:'2026-09-07'};
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
