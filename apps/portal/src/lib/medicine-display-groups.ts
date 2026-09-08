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
