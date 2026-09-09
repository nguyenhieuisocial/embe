import {expect,it} from 'vitest';
import {render,screen} from '@testing-library/react';
import {medicalReadingSummary} from '../src/lib/medical-reading-summary';
import type {DocumentAnalysis} from '../src/lib/medical-document-scan';
import PregnancyRecordSummary from '../src/components/pregnancy-record-summary';
import type {MedicalRecord} from '../src/lib/pregnancy-medical';
const analysis:DocumentAnalysis={version:1,pages:[{page:1,kind:'prescription',title:'Đơn thuốc',warnings:[],fields:[],charges:[],medicines:[{name:'Thuốc mẫu',dose:'1 viên',frequency:'2 lần/ngày',instructions:'Sau ăn',ingredients:'',duration:'5 ngày',evidence:'source',unclear:false}]}]};
it('retains dose frequency duration and source page without activating a care plan',()=>{
 const result=medicalReadingSummary(analysis,false);
 expect(result.medicines[0]).toMatchObject({label:'Thuốc mẫu',value:'1 viên · 2 lần/ngày',page:1,unclear:true});
 expect(result.medicines[0].details).toContain('Thời gian: 5 ngày');
 expect(result).not.toHaveProperty('plans');
});
it('does not remove uncertainty after document confirmation',()=>{
 const uncertain={...analysis,pages:[{...analysis.pages[0],medicines:[{...analysis.pages[0].medicines[0],unclear:true}]}]};
 expect(medicalReadingSummary(uncertain,true).medicines[0].unclear).toBe(true);
 expect(medicalReadingSummary(analysis,true).medicines[0].unclear).toBe(false);
 expect(medicalReadingSummary({...analysis,pages:[{...analysis.pages[0],warnings:['Khó đọc']}]},true).medicines[0].unclear).toBe(true);
});
it('preserves medicines on separate pages instead of merging separate instructions',()=>{
 expect(medicalReadingSummary({...analysis,pages:[analysis.pages[0],{...analysis.pages[0],page:2}]},false).medicines.map(r=>r.page)).toEqual([1,2]);
});
it('never uses an uncertain printed date as a grouping key',()=>{
 const dated={...analysis,pages:[{...analysis.pages[0],fields:[{label:'Ngày khám',value:'07/09/2026',unit:'',reference:'',evidence:'',unclear:true}]}]};
 expect(medicalReadingSummary(dated,true).medicines[0].sourceDay).toBeUndefined();
 dated.pages[0].fields[0].unclear=false;
 expect(medicalReadingSummary(dated,true).medicines[0].sourceDay).toBe('2026-09-07');
});
it('shows readings before clinical import and exposes unavailable sources',()=>{
 const record:MedicalRecord={id:'r',kind:'other',status:'completed',occurredAt:'2026-09-08',title:'Hồ sơ',provider:'',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[],documentIntake:true,documents:[{id:'d',originalFilename:'Đơn thuốc',mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08',scanStatus:'review',readingSummary:medicalReadingSummary(analysis,false)},{id:'failed',originalFilename:'Chưa tải',mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08',scanStatus:'review'}]};
 render(<PregnancyRecordSummary records={[record]}/>);
 expect(screen.getByText('Thuốc mẫu')).toBeInTheDocument();
 expect(screen.getByRole('alert')).toHaveTextContent('1 bản đọc chưa tải được');
 expect(screen.getByText('Đơn thuốc · trang 1').closest('a')).toHaveAttribute('href','/me-bau/ho-so/tai-lieu/d');
});
it('renders two OCR variants from the same prescription as one source card',()=>{
 const duplicated:DocumentAnalysis={...analysis,pages:[{...analysis.pages[0],medicines:[analysis.pages[0].medicines[0],{...analysis.pages[0].medicines[0],frequency:'2 lần'}]}]};
 const record:MedicalRecord={id:'r',kind:'clinical',status:'completed',occurredAt:'2026-09-08',title:'Hồ sơ',provider:'',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[],documents:[{id:'d',originalFilename:'Đơn thuốc',mimeType:'image/jpeg',byteSize:1,createdAt:'2026-09-08',readingSummary:medicalReadingSummary(duplicated,false)}]};
 render(<PregnancyRecordSummary records={[record]}/>);
 expect(screen.getAllByText('Đơn thuốc · trang 1')).toHaveLength(1);
 expect(screen.getByText('2 bản đọc cách dùng trên cùng giấy tờ')).toBeInTheDocument();
 expect(screen.getByText('1 viên · 2 lần/ngày')).toBeInTheDocument();
 expect(screen.getByText('1 viên · 2 lần')).toBeInTheDocument();
});

it('keeps the overview collapsed and places saved medicines inside the same medicine section',()=>{
 const record:MedicalRecord={id:'r',kind:'clinical',status:'completed',occurredAt:'2026-09-07',title:'Khám',provider:'Cơ sở A',clinician:'',notes:'',gestationalWeek:null,nextAppointmentAt:null,measurements:{},medicines:[{name:'Thuốc đã ghi',dose:'Theo đơn',frequency:'',instructions:''}],documents:[]};
 const before=JSON.stringify(record);
 const {container}=render(<PregnancyRecordSummary records={[record]}/>);
 expect(container.querySelector('details[open]')).toBeNull();
 const stored=screen.getByText('Thuốc đã nhập vào hồ sơ').closest('details')!;
 expect(stored.parentElement?.closest('details')?.querySelector('summary')?.textContent).toContain('Thuốc trong giấy tờ');
 expect(screen.queryByText('Thuốc trong hồ sơ gần nhất')).not.toBeInTheDocument();
 expect(JSON.stringify(record)).toBe(before);
});
