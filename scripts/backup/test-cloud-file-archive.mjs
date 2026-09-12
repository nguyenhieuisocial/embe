import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,seal,digest,boundedBody,MAX_BYTES} from '../../supabase/functions/cloud-file-archive/handler.mjs';
const token='a'.repeat(64),key='b'.repeat(64);
const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:4096,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
const job={key,id:'test',version:'1',bucket:'embe-medical-records',name:'private-test.jpg',metadata:{},bytes:1024};
const bytes=new Uint8Array(1024).fill(42);
const request=(method='POST',auth=token)=>new Request('https://example.invalid',{method,headers:{Authorization:`Bearer ${auth}`}});
function fixture(options={}){
 const objects=new Map(),calls=[];
 const archive={head:async k=>objects.has(k)?{sha256:await digest(objects.get(k)),bytes:objects.get(k).length}:null,get:async k=>objects.get(k),put:async(k,v)=>{calls.push('put');objects.set(k,v);}};
 const rpc=async(name,args)=>{calls.push([name,args]);if(name==='embe_claim_file_archive')return {lease:'lease',jobs:[job]};if(name==='embe_file_archive_source_matches')return true;if(name==='embe_file_archive_status')return {saved:1};return null;};
 return {objects,calls,handler:createHandler({token,publicKey:pair.publicKey,archive,rpc,storage:async()=>bytes,...options}),archive,rpc};
}
test('authenticated encryption restores all bytes and protected metadata; tampering fails',async()=>{
 const sealed=await seal(bytes,job,pair.publicKey),n=new DataView(sealed.buffer).getUint32(6),head=sealed.slice(10,10+n),header=JSON.parse(new TextDecoder().decode(head));
 assert.equal(new TextDecoder().decode(sealed.slice(0,6)),'EMBA1\n');
 assert.ok(!new TextDecoder().decode(sealed).includes(job.name));
 const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},pair.privateKey,Buffer.from(header.key,'base64'));
 const aes=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
 const decrypt=()=>crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(header.iv,'base64'),additionalData:head},aes,sealed.slice(10+n));
 const plain=new Uint8Array(await decrypt()),metaSize=new DataView(plain.buffer).getUint32(0),meta=JSON.parse(new TextDecoder().decode(plain.slice(4,4+metaSize)));
 assert.equal(meta.sha256,await digest(bytes));assert.equal(meta.name,job.name);assert.deepEqual(plain.slice(4+metaSize),bytes);
 sealed[sealed.length-1]^=1;await assert.rejects(decrypt);
});
test('unauthorized/malformed/method requests do not reach private storage',async()=>{
 const f=fixture();for(const auth of ['nope','b'.repeat(64),'é'.repeat(64)])assert.equal((await f.handler(request('POST',auth))).status,401);
 assert.equal((await f.handler(request('GET'))).status,405);assert.equal(f.calls.length,0);
});
test('copies once, reads back checksum, resumes existing archive without new source access',async()=>{
 const f=fixture();assert.equal((await f.handler(request())).status,200);assert.equal(f.objects.size,1);
 assert.equal((await f.handler(request())).status,200);assert.equal(f.calls.filter(x=>x==='put').length,1);
 const finish=f.calls.filter(x=>Array.isArray(x)&&x[0]==='embe_finish_file_archive');assert.equal(finish[0][1].p_results.length,1);
});
test('changed source, download failure, bad bucket and corrupted storage never report saved',async()=>{
 for(const scenario of ['changed','download','bucket','corrupt']){
  const f=fixture();const rpc=async(n,a)=>scenario==='changed'&&n==='embe_file_archive_source_matches'?false:scenario==='bucket'&&n==='embe_claim_file_archive'?{lease:'lease',jobs:[{...job,bucket:'other'}]}:f.rpc(n,a);
  const handler=createHandler({token,publicKey:pair.publicKey,rpc,storage:async()=>{if(scenario==='download')throw Error('secret private detail');return bytes;},archive:{...f.archive,get:scenario==='corrupt'?async()=>new Uint8Array(1):f.archive.get}});
  const res=await handler(request()),body=await res.json();assert.equal(body.saved,0);assert.equal(body.failed,1);assert.ok(!JSON.stringify(body).includes('private'));
 }
});
test('bounded download rejects oversized declared/streamed responses',async()=>{
 await assert.rejects(()=>boundedBody(new Response(bytes,{headers:{'Content-Length':String(MAX_BYTES+1)}}),MAX_BYTES));
 await assert.rejects(()=>boundedBody(new Response(bytes),100));
 assert.deepEqual(await boundedBody(new Response(bytes),1024),bytes);
});
