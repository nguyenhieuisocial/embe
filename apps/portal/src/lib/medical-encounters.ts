import type {MedicalRecord,MedicalDocument} from './pregnancy-medical';

export type MedicalEncounter={id:string;records:MedicalRecord[];documents:MedicalDocument[];followups:{at:string;sourceId:string}[];root:MedicalRecord};
/** Reconstruct persisted links. Equal dates/clinics alone are not patient identity. */
export function medicalEncounters(records:MedicalRecord[]):MedicalEncounter[]{
 const index=new Map(records.map(record=>[record.id,record]));
 const groups=new Map<string,MedicalEncounter>();
 for(const record of records){
  let root=record;const visited=new Set([record.id]);
  while(root.linkedRecordId){
   const parent=index.get(root.linkedRecordId);
   if(!parent||visited.has(parent.id)){root=record;break;}
   visited.add(parent.id);root=parent;
  }
  let group=groups.get(root.id);
  if(!group){group={id:root.id,root,records:[],documents:[],followups:[]};groups.set(root.id,group);}
  group.records.push(record);
  for(const document of record.documents)if(!group.documents.some(d=>d.id===document.id))group.documents.push(document);
  if(record.nextAppointmentAt&&Number.isFinite(Date.parse(record.nextAppointmentAt))
    &&Date.parse(record.nextAppointmentAt)>Date.parse(record.occurredAt)
    &&!group.followups.some(event=>event.at===record.nextAppointmentAt))group.followups.push({at:record.nextAppointmentAt,sourceId:record.id});
 }
 return [...groups.values()].sort((a,b)=>Date.parse(b.root.occurredAt)-Date.parse(a.root.occurredAt));
}
