import {expect,it} from 'vitest';
import {printedDate,proposeDocumentImport} from '../src/lib/medical-document-import';
import {medicalDocumentName} from '../src/lib/medical-document-name';
import type {DocumentAnalysis} from '../src/lib/medical-document-scan';
const analysis=(label:string,value:string,unit='',unclear=false):DocumentAnalysis=>({version:1,pages:[{page:1,kind:'laboratory',title:'Phiếu xét nghiệm',warnings:[],medicines:[],charges:[],fields:[{label,value,unit,unclear,reference:'',evidence:value}]}]});
it('reads printed Vietnamese dates with and without a city, rejects impossible days',()=>{
 expect(printedDate('TP. HCM, ngày 07 tháng 09 năm 2026')).toBe('2026-09-07');
 expect(printedDate('07 tháng 09 năm 2026')).toBe('2026-09-07');
 expect(printedDate('ngày 31 tháng 02 năm 2026')).toBe('');
 expect(printedDate('07 tháng 09 năm 2026 và 08 tháng 09 năm 2026')).toBe('');
 expect(printedDate('07/09/2026 và 08/09/2026')).toBe('');
 expect(printedDate('2026-09-07 đến 2026-09-08')).toBe('');
 expect(printedDate('07/09/2026 17:30')).toBe('2026-09-07');
 expect(printedDate('2026-09-07T17:30:00.000+07:00')).toBe('2026-09-07');
 expect(printedDate('07/09/2026 25:70')).toBe('');
});
it('uses document date labels without interpreting a follow-up date as visit date',()=>{
 const source=analysis('Ngày thực hiện','TP. HCM, ngày 07 tháng 09 năm 2026');
 expect(proposeDocumentImport(source,[],'id').details.occurredOn).toBe('2026-09-07');
 expect(medicalDocumentName([source])).toContain('07/09/2026');
 expect(proposeDocumentImport(analysis('Ngày tái khám','14/09/2026'),[],'id').details.occurredOn).toBe('');
 expect(proposeDocumentImport(analysis('Ngày thực hiện','07/09/2026','',true),[],'id').details.occurredOn).toBe('');
});
it('maps explicit units to new clinical fields and preserves wrong-unit values outside charts',()=>{
 for(const [label,value,unit,key] of [['Chiều cao','160','cm','heightCm'],['Mạch','80','bpm','maternalHeartRate'],['RBC','4.2','10^12/L','rbc1012l'],['WBC','7','10⁹/L','wbc109l'],['Creatinine','65','µmol/L','creatinineUmolL']]) {
  expect(proposeDocumentImport(analysis(label,value,unit),[],'id').details.measurements[key]).toBe(Number(value));
 }
 expect(proposeDocumentImport(analysis('Creatinine','1','mg/dL'),[],'id').details.measurements).toEqual({});
});
it('deduplicates spacing-only medicine differences but does not select conflicting doses',()=>{
 const source=analysis('Ngày khám','07/09/2026');source.pages[0].kind='prescription';
 const medicine={name:'Thuốc A',ingredients:'',dose:'1 viên',frequency:'2 lần/ngày',instructions:'Sau ăn',evidence:'',unclear:false};
 source.pages[0].medicines=[medicine,{...medicine,name:' Thuốc A ',dose:'1  viên'}];
 expect(proposeDocumentImport(source,[],'id').details.medicines).toHaveLength(1);
 source.pages[0].medicines[1].dose='2 viên';
 const result=proposeDocumentImport(source,[],'id');expect(result.details.medicines).toHaveLength(0);expect(result.warnings.join(' ')).toContain('cách dùng khác nhau');
});
