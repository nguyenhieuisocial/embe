import {AwsClient} from 'npm:aws4fetch@1.0.20';
import {createHandler,boundedBody} from './handler.mjs';
import {PUBLIC_KEY} from './recipient.mjs';
const base=Deno.env.get('SUPABASE_URL');
if(base!=='https://tpqqzowhndbkmkckpbgv.supabase.co')throw Error('project_identity');
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const account=Deno.env.get('EMBE_BACKUP_R2_ACCOUNT')||'';
if(!/^[a-f0-9]{32}$/.test(account)||!service)throw Error('archive_configuration');
const client=new AwsClient({accessKeyId:Deno.env.get('EMBE_BACKUP_R2_ACCESS_KEY')||'',secretAccessKey:Deno.env.get('EMBE_BACKUP_R2_SECRET_KEY')||'',service:'s3',region:'auto',retries:1});
const headers={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
function url(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw Error('invalid_key');return `https://${account}.r2.cloudflarestorage.com/embe-backup/cloud-files-v1/${key}.emba`;}
const publicKey=await crypto.subtle.importKey('spki',Uint8Array.from(atob(PUBLIC_KEY),c=>c.charCodeAt(0)),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
Deno.serve(createHandler({token:Deno.env.get('EMBE_FILE_ARCHIVE_TOKEN'),publicKey,
 async rpc(name:string,body:unknown){const res=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!res.ok){await res.body?.cancel();throw Error('rpc_failed');}const text=await res.text();return text?JSON.parse(text):null;},
 async storage(job:{bucket:string;name:string;bytes:number}){
  if(job.name.split('/').some(part=>!part||part==='.'||part==='..')||job.name.includes('\\'))throw Error('source_path');
  const path=job.name.split('/').map(encodeURIComponent).join('/');
  return await boundedBody(await fetch(`${base}/storage/v1/object/authenticated/${job.bucket}/${path}`,{headers,cache:'no-store',signal:AbortSignal.timeout(15000)}),job.bytes);
 },
 archive:{
  async head(key:string){const res=await client.fetch(url(key),{method:'HEAD',signal:AbortSignal.timeout(10000)});if(res.status===404)return null;if(!res.ok)throw Error('head_failed');return {sha256:res.headers.get('x-amz-meta-sha256'),bytes:Number(res.headers.get('content-length'))};},
  async get(key:string,limit:number){return await boundedBody(await client.fetch(url(key),{signal:AbortSignal.timeout(15000)}),limit);},
  async put(key:string,body:Uint8Array,sha256:string){const res=await client.fetch(url(key),{method:'PUT',body,headers:{'Content-Type':'application/octet-stream','x-amz-meta-sha256':sha256,'If-None-Match':'*'},signal:AbortSignal.timeout(15000)});await res.body?.cancel();if(!res.ok)throw Error('put_failed');}
 }
}));
