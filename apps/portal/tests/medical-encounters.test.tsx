import {it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {medicalEncounters} from '../src/lib/medical-encounters';
import MedicalEncounterChain from '../src/components/medical-encounter-chain';
import type {MedicalRecord} from '../src/lib/pregnancy-medical';
const record=(id:string):MedicalRecord=>({id,kind:'clinical',status:'completed',occurredAt:'2026-09-07T10:00:00Z',title:'Khám',provider:'Cơ sở A',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[],documents:[]});
it('links four original documents to one visit and its stored follow-up',()=>{
 const root=record('visit');root.nextAppointmentAt='2026-09-14T10:30:00Z';
 const children=['clinical','ultrasound','prescription','receipt'].map((kind,i)=>({...record('part'+i),linkedRecordId:root.id,documents:[{id:'doc'+i,originalFilename:'Giấy '+i,mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08',detectedKinds:[kind]}]}));
 const source=[root,...children];const before=JSON.stringify(source);
 const chains=medicalEncounters(source);expect(chains).toHaveLength(1);expect(chains[0].documents).toHaveLength(4);expect(chains[0].followups).toHaveLength(1);
 expect(JSON.stringify(source)).toBe(before);
 render(<MedicalEncounterChain records={source}/>);
 expect(screen.getByRole('region',{name:'Chuỗi khám & tái khám'})).toBeInTheDocument();
 expect(screen.getAllByRole('link',{hidden:true}).filter(link=>link.getAttribute('href')?.includes('/tai-lieu/'))).toHaveLength(4);
});
it('does not infer a visit from matching dates and clinics without a saved link',()=>{expect(medicalEncounters([record('a'),record('b')])).toHaveLength(2);});
it('handles missing links and cycles without hiding records',()=>{
 const a={...record('a'),linkedRecordId:'b'},b={...record('b'),linkedRecordId:'a'};
 expect(medicalEncounters([a,b])).toHaveLength(2);
 expect(medicalEncounters([a])).toHaveLength(1);
});
it('deduplicates repeated document IDs and followup times but rejects an earlier followup',()=>{
 const a=record('a');a.documents=[{id:'d',originalFilename:'Giấy',mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08'}];a.nextAppointmentAt='2026-09-14T10:30:00Z';
 const b={...a,id:'b',linkedRecordId:'a'};
 expect(medicalEncounters([a,b])[0].documents).toHaveLength(1);expect(medicalEncounters([a,b])[0].followups).toHaveLength(1);
 a.nextAppointmentAt='2026-09-06T10:00:00Z';expect(medicalEncounters([a])[0].followups).toHaveLength(0);
});
