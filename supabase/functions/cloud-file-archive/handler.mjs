export const MAX_BYTES = 25 * 1024 * 1024;
export const BUCKETS = ['embe-meal-inbox','embe-medical-records','embe-photo-inbox','embe-studio-drafts'];
const encoder = new TextEncoder();
export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
export async function seal(bytes, job, publicKey) {
  const metadata = encoder.encode(JSON.stringify({...job,sha256:await digest(bytes)}));
  if(metadata.length>16384) throw Error('metadata_limit');
  const plain = new Uint8Array(4+metadata.length+bytes.length);
  new DataView(plain.buffer).setUint32(0,metadata.length); plain.set(metadata,4); plain.set(bytes,4+metadata.length);
  const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'},publicKey,await crypto.subtle.exportKey('raw',key)));
  const header = encoder.encode(JSON.stringify({v:1,algorithm:'RSA-OAEP-SHA256/AES-256-GCM',iv:base64(iv),key:base64(wrapped)}));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:header},key,plain));
  const out = new Uint8Array(10+header.length+cipher.length);
  out.set(encoder.encode('EMBA1\n')); new DataView(out.buffer).setUint32(6,header.length); out.set(header,10); out.set(cipher,10+header.length);
  return out;
}
export async function boundedBody(response, limit) {
  if(!response.ok || !response.body) throw Error('download_failed');
  const declared = Number(response.headers.get('content-length'));
  if(declared>limit) { await response.body.cancel(); throw Error('size_limit'); }
  const reader=response.body.getReader(), chunks=[]; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length;
    if(size>limit) { await reader.cancel(); throw Error('size_limit'); } chunks.push(value); }
  const out=new Uint8Array(size); let offset=0; for(const chunk of chunks) {out.set(chunk,offset);offset+=chunk.length;} return out;
}
async function authorized(request, token) {
  const provided=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(token||'') || !/^[a-f0-9]{64}$/.test(provided||'')) return false;
  const [a,b]=await Promise.all([digest(encoder.encode(token)),digest(encoder.encode(provided))]);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
export function createHandler({token,rpc,storage,archive,publicKey,now=()=>Date.now()}) {
 return async request=>{
  const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if(!await authorized(request,token))return reply(401,{error:'unauthorized'});
  if(request.method!=='POST' || new URL(request.url).search)return reply(405,{error:'unsupported_request'});
  let lease;const results=[];let failed=0;
  try{
   const claim=await rpc('embe_claim_file_archive',{}); if(claim.busy)return reply(202,{busy:true});
   lease=claim.lease;const started=now();
   if(!Array.isArray(claim.jobs)||claim.jobs.length>10)throw Error('invalid_claim');
   for(const job of claim.jobs){
    if(now()-started>40000)break;
    try{
     if(!BUCKETS.includes(job.bucket)||!/^[a-f0-9]{64}$/.test(job.key)||!Number.isInteger(job.bytes)||job.bytes<1||job.bytes>MAX_BYTES)throw Error('invalid_job');
     const old=await archive.head(job.key);
     if(old){
      if(!/^[a-f0-9]{64}$/.test(old.sha256||'')||old.bytes<job.bytes+512||old.bytes>job.bytes+32768)throw Error('invalid_archive');
      const saved=await archive.get(job.key,job.bytes+32768);
      if(saved.length!==old.bytes||await digest(saved)!==old.sha256)throw Error('archive_corrupt');
      results.push({key:job.key,sha256:old.sha256,bytes:old.bytes});continue;
     }
     const bytes=await storage(job);
     if(bytes.length!==job.bytes||!await rpc('embe_file_archive_source_matches',{p_key:job.key}))throw Error('source_changed');
     const cipher=await seal(bytes,job,publicKey),sha256=await digest(cipher);
     await archive.put(job.key,cipher,sha256);
     const verified=await archive.get(job.key,cipher.length);
     if(verified.length!==cipher.length||await digest(verified)!==sha256)throw Error('archive_verification');
     results.push({key:job.key,sha256,bytes:cipher.length});
    }catch{failed++;}
   }
   await rpc('embe_finish_file_archive',{p_lease:lease,p_results:results});lease=null;
   return reply(failed?207:200,{saved:results.length,failed,status:await rpc('embe_file_archive_status',{})});
  }catch{
   // Never emit file names, documents, credentials or provider error messages.
   if(lease)try{await rpc('embe_finish_file_archive',{p_lease:lease,p_results:results});}catch{}
   return reply(503,{error:'archive_unavailable'});
  }
 };
}
