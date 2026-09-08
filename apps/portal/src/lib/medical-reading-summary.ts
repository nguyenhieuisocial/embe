import { groupDocumentData } from './medical-document-data';
import type { DocumentAnalysis } from './medical-document-scan';
import {documentDateEvidence} from './medical-document-name';
import {documentFieldCategory} from './medical-document-overview';

export type ReadingRow = {page:number;label:string;value:string;details:string[];unclear:boolean;sourceDay?:string;sourceIdentity?:string};
export type MedicalReadingSummary = {findings:ReadingRow[];results:ReadingRow[];medicines:ReadingRow[]};
/** A compact projection of the reading, never a confirmed medical record or care plan. */
export function medicalReadingSummary(analysis:DocumentAnalysis, confirmed:boolean):MedicalReadingSummary {
  const groups=groupDocumentData(analysis);
  const rows=(key:keyof MedicalReadingSummary)=>groups[key].map(row=>{
    const evidence=documentDateEvidence([{...analysis,pages:analysis.pages.filter(page=>page.page===row.page)}]);
    const identity=groups.identity.filter(field=>field.page===row.page);
    const patients=identity.filter(field=>documentFieldCategory(field.label)==='patient');
    const sourceIdentity=patients.length===1&&patients[0].value.trim()&&identity.every(field=>!field.unclear)
      ? JSON.stringify(identity.map(field=>[field.label.normalize('NFC').trim(),field.value.normalize('NFC').trim(),field.details]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))) : undefined;
    return {page:row.page,label:row.label,value:row.value,details:row.details,sourceIdentity,sourceDay:!evidence.conflicting&&!evidence.tentative&&evidence.dates.length===1?evidence.dates[0]:undefined,unclear:row.unclear||!confirmed||analysis.pages.some(page=>page.page===row.page&&page.warnings.length>0)};
  });
  return {findings:rows('findings'),results:rows('results'),medicines:rows('medicines')};
}
