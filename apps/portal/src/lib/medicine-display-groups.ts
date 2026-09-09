/** Group headings only: never merge doses, infer active therapy, or mutate source rows. */
export function medicineDisplayGroups<T>(rows:T[],name:(row:T)=>string):{name:string;rows:T[]}[]{
 const groups=new Map<string,{name:string;rows:T[]}>();
 for(const row of rows){
  const title=name(row).normalize('NFC').trim().replace(/\s+/g,' ');
  const key=title.toLocaleLowerCase('vi');
  const existing=groups.get(key);
  if(existing)existing.rows.push(row);else groups.set(key,{name:title,rows:[row]});
 }
 return [...groups.values()];
}

/** One source document, possibly several OCR variants. Never infer equivalent doses. */
export function medicineSourceGroups<T>(rows:T[],source:(row:T)=>string):{source:string;rows:T[]}[]{
 const groups=new Map<string,{source:string;rows:T[]}>();
 for(const row of rows){
  const key=source(row);
  const existing=groups.get(key);
  if(existing)existing.rows.push(row);else groups.set(key,{source:key,rows:[row]});
 }
 return [...groups.values()];
}

/** Presentation equivalence only. Preserve digits, accents, units, route and missing fields. */
export function medicineReadingKey(parts:string[]):string {
 return JSON.stringify(parts.map(part=>part.normalize('NFC').toLocaleLowerCase('vi')
   .replace(/(\d)\s*(mg|mcg|ml|µg)\b/gu,'$1 $2')
   .replace(/\s*([·;\n])\s*/gu,';').split(';').map(s=>s.trim().replace(/\s+/g,' ').replace(/[.]$/u,'')).filter(Boolean).sort()));
}
export function uniqueMedicineReadings<T>(rows:T[],parts:(row:T)=>string[],merge:(a:T,b:T)=>T):T[]{
 const grouped=new Map<string,T>();
 for(const row of rows){const key=medicineReadingKey(parts(row));const prior=grouped.get(key);grouped.set(key,prior?merge(prior,row):row);}
 return [...grouped.values()];
}
