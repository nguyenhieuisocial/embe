import { groupDocumentData } from './medical-document-data';
import type { DocumentAnalysis } from './medical-document-scan';
import {documentDateEvidence} from './medical-document-name';
import {documentFieldCategory} from './medical-document-overview';
import {providerKey} from './medical-document-import';

export type ReadingRow = {page:number;label:string;value:string;details:string[];unclear:boolean;sourceDay?:string;sourceIdentity?:string;displayEncounter?:string|null};
export type MedicalReadingSummary = {findings:ReadingRow[];results:ReadingRow[];medicines:ReadingRow[]};
/** A compact projection of the reading, never a confirmed medical record or care plan. */
export function medicalReadingSummary(analysis:DocumentAnalysis, confirmed:boolean):MedicalReadingSummary {
  const groups=groupDocumentData(analysis);
  const rows=(key:keyof MedicalReadingSummary)=>groups[key].map(row=>{
    const evidence=documentDateEvidence([{...analysis,pages:analysis.pages.filter(page=>page.page===row.page)}]);
    const identity=groups.identity.filter(field=>field.page===row.page);
    const patients=identity.filter(field=>documentFieldCategory(field.label)==='patient');
    const literal=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
    const names=[...new Set(patients.map(field=>literal(field.value)).filter(Boolean))];
    const sourceIdentity=names.length===1&&patients.every(field=>!field.unclear) ? names[0] : undefined;
    const facilities=[...new Set(identity.filter(field=>documentFieldCategory(field.label)==='facility').map(field=>providerKey(field.value)).filter(Boolean))];
    const patientIds=[...new Set(identity.filter(field=>documentFieldCategory(field.label)==='patient-id').map(field=>literal(field.value)).filter(Boolean))];
    // A display-only match of literal readings within their existing record. This
    // does not confirm OCR, import a date, merge database records or activate drugs.
    // Different PDF alternatives, dates, people or facilities must stay separate.
    const displayEncounter=names.length===1&&facilities.length===1&&patientIds.length<=1
      &&!identity.some(field=>field.details.some(detail=>detail.startsWith('Chữ PDF khác')))
      &&!evidence.conflicting&&!evidence.invalid&&evidence.dates.length===1
      ? JSON.stringify([names[0],patientIds[0]??'',evidence.dates[0],facilities[0]]) : null;
    return {page:row.page,label:row.label,value:row.value,details:row.details,sourceIdentity,displayEncounter,sourceDay:!evidence.conflicting&&!evidence.tentative&&evidence.dates.length===1?evidence.dates[0]:undefined,unclear:row.unclear||!confirmed||evidence.tentative||patients.some(field=>field.unclear)||analysis.pages.some(page=>page.page===row.page&&page.warnings.length>0)};
  });
  return {findings:rows('findings'),results:rows('results'),medicines:rows('medicines')};
}
