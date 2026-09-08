import type {MedicalRecord} from './pregnancy-medical';
import type {ReadingRow} from './medical-reading-summary';
type FindingGroup={row:ReadingRow;labels:string[];sources:{documentId:string;page:number;title:string}[]};
const literal=(text:string)=>text.normalize('NFC').trim().replace(/\s+/g,' ');
/** Display-only grouping. Original readings and clinical records are never changed. */
export function medicalFindingGroups(records:MedicalRecord[]):FindingGroup[]{
 const groups=new Map<string,FindingGroup>();
 for(const record of records)for(const document of record.documents)for(const row of document.readingSummary?.findings??[]){
  // Unknown dates stay inside their own document/page; never use upload dates.
  const scope=row.sourceDay?`${record.id}:${row.sourceDay}`:`${record.id}:${document.id}:${row.page}`;
  const key=JSON.stringify([scope,literal(row.value),row.details.map(literal),row.value.trim()?null:row.label]);
  const source={documentId:document.id,page:row.page,title:document.displayName||document.originalFilename};
  const existing=groups.get(key);
  if(existing){
   if(!existing.labels.includes(row.label))existing.labels.push(row.label);
   if(!existing.sources.some(s=>s.documentId===source.documentId&&s.page===source.page))existing.sources.push(source);
   existing.row.unclear ||= row.unclear;
  }else groups.set(key,{row:{...row},labels:[row.label],sources:[source]});
 }
 return [...groups.values()];
}
