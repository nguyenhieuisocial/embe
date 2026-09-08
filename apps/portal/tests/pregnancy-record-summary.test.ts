import {expect,it} from 'vitest';
import {summarizeRecords} from '../src/components/pregnancy-record-summary';
import type {MedicalRecord} from '../src/lib/pregnancy-medical';
const record=(id:string,day:string):MedicalRecord=>({id,occurredAt:day,title:id,kind:'clinical',status:'completed',provider:'',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{weightKg:54},medicines:[],documents:[]});
it('uses completed clinical records, not upload time, invoices or future visits',()=>{
 const data=[record('old','2026-09-01'),record('latest','2026-09-07'),{...record('invoice','2026-09-08'),kind:'receipt'},record('future','2026-10-01'),{...record('upload','2026-09-08'),documentIntake:true}];
 expect(summarizeRecords(data,Date.parse('2026-09-09')).latest?.id).toBe('latest');
});
it('does not manufacture data for missing metrics',()=>{
 expect(summarizeRecords([],Date.now()).metrics).toEqual([]);
 const summary=summarizeRecords([record('one','2026-09-01')],Date.parse('2026-09-09'));
 expect(summary.metrics).toHaveLength(1);expect(summary.metrics[0].previous).toBeUndefined();
});
