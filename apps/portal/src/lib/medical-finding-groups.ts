import type {MedicalRecord} from './pregnancy-medical';
import type {ReadingRow} from './medical-reading-summary';
import type {MedicalReadingSummary} from './medical-reading-summary';
type FindingGroup={recordId:string;row:ReadingRow;labels:string[];sources:{documentId:string;page:number;title:string}[]};
const literal=(text:string)=>text.normalize('NFC').trim().replace(/\s+/g,' ');
/** Display-only grouping. Original readings and clinical records are never changed. */
export function medicalFindingGroups(records:MedicalRecord[],category:keyof MedicalReadingSummary='findings'):FindingGroup[]{
 const groups=new Map<string,FindingGroup>();
 for(const record of records)for(const document of record.documents)for(const row of document.readingSummary?.[category]??[]){
  // Unknown dates stay inside their own document/page; never use upload dates.
  const scope=row.displayEncounter?`${record.id}:reading:${row.displayEncounter}`:row.displayEncounter===undefined&&row.sourceDay&&row.sourceIdentity?`${record.id}:${row.sourceDay}:${row.sourceIdentity}`:`${record.id}:${document.id}:${row.page}`;
  const key=JSON.stringify([scope,category==='findings'?null:row.sourceKind==='receipt'?'receipt':'clinical',literal(row.value),row.details.map(literal),category==='findings'&&row.value.trim()?null:literal(row.label)]);
  const source={documentId:document.id,page:row.page,title:document.displayName||document.originalFilename};
  const existing=groups.get(key);
  if(existing){
   if(!existing.labels.includes(row.label))existing.labels.push(row.label);
   if(!existing.sources.some(s=>s.documentId===source.documentId&&s.page===source.page))existing.sources.push(source);
   existing.row.unclear ||= row.unclear;
  }else groups.set(key,{recordId:record.id,row:{...row},labels:[row.label],sources:[source]});
 }
 return [...groups.values()];
}

/** Organize variants, not clinical truth. Never select a winning OCR diagnosis. */
export function medicalFindingTopics(records:MedicalRecord[]){
 const topics=new Map<string,{label:string;day?:string;variants:FindingGroup[]}>();
 for(const finding of medicalFindingGroups(records)){
  const label=finding.labels.join(' / ');
  // Use the existing linked visit, not an inferred cross-record patient match.
  const day=finding.row.printedDay??finding.row.sourceDay;
  const scope=day?`${finding.recordId}:${day}`:`${finding.recordId}:${finding.sources[0].documentId}:${finding.row.page}`;
  const key=JSON.stringify([scope,label]);
  const prior=topics.get(key);
  if(prior){
   // Within an already scoped topic, OCR context prose must not duplicate
   // identical printed text. Preserve all contexts and document references.
   const same=prior.variants.find(variant=>literal(variant.row.value)===literal(finding.row.value));
   if(same && finding.row.value.trim()){
    same.row={...same.row,unclear:same.row.unclear||finding.row.unclear,
     details:[...new Set([...same.row.details,...finding.row.details])]};
    for(const source of finding.sources)if(!same.sources.some(s=>s.documentId===source.documentId&&s.page===source.page))same.sources.push(source);
   }else prior.variants.push(finding);
  }else topics.set(key,{label,day,variants:[finding]});
 }
 return [...topics.values()];
}
