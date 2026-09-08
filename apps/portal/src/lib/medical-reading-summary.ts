import { groupDocumentData } from './medical-document-data';
import type { DocumentAnalysis } from './medical-document-scan';

export type ReadingRow = {page:number;label:string;value:string;details:string[];unclear:boolean};
export type MedicalReadingSummary = {findings:ReadingRow[];results:ReadingRow[];medicines:ReadingRow[]};
/** A compact projection of the reading, never a confirmed medical record or care plan. */
export function medicalReadingSummary(analysis:DocumentAnalysis, confirmed:boolean):MedicalReadingSummary {
  const groups=groupDocumentData(analysis);
  const rows=(key:keyof MedicalReadingSummary)=>groups[key].map(row=>({page:row.page,label:row.label,value:row.value,details:row.details,unclear:row.unclear||!confirmed||analysis.pages.some(page=>page.page===row.page&&page.warnings.length>0)}));
  return {findings:rows('findings'),results:rows('results'),medicines:rows('medicines')};
}
