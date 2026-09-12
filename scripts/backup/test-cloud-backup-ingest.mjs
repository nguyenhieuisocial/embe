import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler, backupSlot, sha256, MAX_BYTES} from '../../supabase/functions/cloud-backup-ingest/handler.mjs';
const token='a'.repeat(64), date=new Date('2026-09-12T13:00:00Z');
const data=new Uint8Array(1024); data.set([0x30,0x82,0x04,0x00,0x06,0x0b,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x09,0x10,0x01,0x17]);
async function req(method='POST', body=data, extra={}) {
  return new Request('https://example.invalid/?key=restic-critical/config', {method,
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/pkcs7-mime','Content-Length':String(body.length),'X-Content-SHA256':await sha256(body),...extra},
    ...(method==='POST'?{body}: {})});
}
function fixture(existing=null, options={}) {
  let item=existing; const calls=[];
  const handler=createHandler({token,now:()=>date,head:async()=>item,put:async(key,body,meta,etag)=>{calls.push({key,etag}); item={...meta,size:body.length,etag:'new'}; return true;},...options});
  return {handler,calls};
}
test('unauthorized and unsupported callers cannot touch storage',async()=>{
 const {handler,calls}=fixture(null,{head:()=>{throw Error('must not read');}});
 assert.equal((await handler(await req('POST',data,{Authorization:'Bearer nope'}))).status,401);
 assert.equal((await handler(await req('GET'))).status,405); assert.equal(calls.length,0);
});
test('fixed slot, verified metadata, one successful upload each day',async()=>{
 const {handler,calls}=fixture(); assert.equal((await handler(await req('HEAD'))).status,404);
 assert.equal((await handler(await req())).status,201); assert.equal(calls[0].key,backupSlot(date).key);
 assert.equal((await handler(await req('HEAD'))).status,204); assert.equal((await handler(await req())).status,409);
 assert.equal(calls.length,1);
});
test('reject missing/oversized length, plaintext, and damaged checksum',async()=>{
 const {handler,calls}=fixture();
 assert.equal((await handler(await req('POST',data,{'Content-Length':String(MAX_BYTES+1)}))).status,413);
 assert.equal((await handler(await req('POST',data,{'Content-Length':'0'}))).status,413);
 assert.equal((await handler(await req('POST',data,{'X-Content-SHA256':'b'.repeat(64)}))).status,400);
 assert.equal((await handler(await req('POST',new Uint8Array(1024)))).status,415);
 assert.equal(calls.length,0);
});
test('only expired slots recycle with conditional write; bound to 35 slots',async()=>{
 const {handler,calls}=fixture({date:'2026-08-08',etag:'old'});
 assert.equal((await handler(await req())).status,201); assert.equal(calls[0].etag,'old');
 for(const d of ['bad','2020-99-99','2026-09-11','2026-09-13']) assert.equal((await fixture({date:d}).handler(await req())).status,409);
 const slots=new Set(Array.from({length:365},(_,i)=>backupSlot(new Date(+date+i*86400000)).key)); assert.equal(slots.size,35);
});
test('storage failure, concurrent update, and missing verification never report success',async()=>{
 assert.equal((await fixture(null,{put:async()=>false}).handler(await req())).status,409);
 assert.equal((await fixture(null,{put:async()=>true}).handler(await req())).status,502);
 assert.equal((await fixture(null,{head:async()=>{throw Error('secret error');}}).handler(await req())).status,503);
 assert.equal((await fixture(null,{report:async()=>{throw Error('status failed');}}).handler(await req())).status,503);
});
