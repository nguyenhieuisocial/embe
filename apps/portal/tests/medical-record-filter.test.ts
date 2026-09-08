import {expect,it} from 'vitest';
import {medicalRecordMatchesKind, type MedicalRecord} from '../src/lib/pregnancy-medical';
const record:MedicalRecord={id:'r',occurredAt:'2026-09-08',title:'Lần khám',kind:'appointment',status:'completed',provider:'',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[],documents:[{id:'d',originalFilename:'image.jpg',mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08',scanStatus:'review',detectedKinds:['prescription','receipt']}]};
it('includes a read prescription inside an appointment before clinical import',()=>{
 expect(medicalRecordMatchesKind(record,'prescription')).toBe(true);
 expect(medicalRecordMatchesKind(record,'appointment')).toBe(true);
 expect(record.kind).toBe('appointment');expect(record.medicines).toEqual([]);
});
it('supports multiple document types without duplicating the record',()=>{
 for(const kind of ['all','receipt','prescription'])expect([record].filter(r=>medicalRecordMatchesKind(r,kind))).toHaveLength(1);
 expect(medicalRecordMatchesKind(record,'ultrasound')).toBe(false);
});
it('does not guess a prescription from filename or medicines',()=>{
 const unread={...record,documents:[{...record.documents[0],originalFilename:'don-thuoc.jpg',detectedKinds:undefined}]};
 expect(medicalRecordMatchesKind(unread,'prescription')).toBe(false);
 expect(medicalRecordMatchesKind({...unread,kind:'prescription'},'prescription')).toBe(true);
});
