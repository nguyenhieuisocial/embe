// Read-only production inspection. Mutation checks use browser-local fixtures only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
const phase=process.env.EMBE_AUDIT_PHASE==='before'?'before':'after';
const output=`data/medical-redesign-${phase}`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:375,height:852},reducedMotion:'reduce'});
await context.addInitScript(()=>{
 localStorage.setItem('embe:device-role','mother');
 localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now()));
});
const page=await context.newPage(),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
let records=[],fixture=false,loadFailure=false,saveFailure=false,saves=0;
const specimen={id:'11111111-1111-4111-8111-111111111111',kind:'clinical',status:'completed',occurredAt:'2026-09-07T10:00:00Z',title:'Hồ sơ mẫu kiểm tra giao diện',provider:'Cơ sở mẫu',clinician:'',notes:'',gestationalWeek:10,nextAppointmentAt:null,medicines:[],measurements:{},documents:[]};
page.on('response',async response=>{
 if(new URL(response.url()).pathname==='/api/pregnancy/records'&&response.ok()){
  try{records=(await response.json()).records??[];}catch{}
 }
});
const geometry=()=>page.evaluate(()=>{
 const visible=el=>{
  const r=el.getBoundingClientRect();
  if(!r.width||!r.height||getComputedStyle(el).visibility==='hidden'||el.closest('[hidden],.sr-only,[aria-hidden="true"]'))return false;
  for(let p=el.parentElement;p;p=p.parentElement)if(p.matches('details:not([open])')&&!p.querySelector(':scope > summary')?.contains(el))return false;
  return true;
 };
 return {height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,
  smallTargets:[...document.querySelectorAll('main a,main button,main summary')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.width<43||r.height<43;}).map(el=>({class:el.className,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))};
});
try{
 const version=(await (await context.request.get(origin+'/api/health')).json()).version;
 if(process.env.EMBE_AUDIT_EXPECTED_VERSION)assert.equal(version,process.env.EMBE_AUDIT_EXPECTED_VERSION);
 await context.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/auth/login')return route.continue();
  if(fixture&&path==='/api/pregnancy/records'){
   if(request.method()==='POST'){
    saves++;const body=request.postDataJSON();assert.equal(body.id,specimen.id);
    await new Promise(resolve=>setTimeout(resolve,350));
    if(saveFailure)return route.fulfill({status:503,json:{error:'fixture save failed'}});
    Object.assign(specimen,body);return route.fulfill({json:{id:specimen.id}});
   }
   return loadFailure?route.fulfill({status:503,json:{error:'fixture unavailable'}}):route.fulfill({json:{records:[specimen]}});
  }
  return ['GET','HEAD'].includes(request.method())?route.continue():route.abort('blockedbyclient');
 });
 await page.goto(origin+'/me-bau/ho-so');
 if(page.url().includes('/login')){
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/me-bau/ho-so',{timeout:45000});
 }
 await page.getByRole('region',{name:'Tóm tắt thai kỳ'}).waitFor({timeout:45000});
 const nav=page.getByRole('navigation',{name:'Đi nhanh trong hồ sơ'});
 for(const width of [375,430,768,1280]){
  await page.setViewportSize({width,height:852});
  for(const [view,label] of [['overview','Tổng quan'],['documents','Giấy tờ'],['visits','Lịch khám']]){
   await nav.getByRole('link',{name:label,exact:true}).click();
   await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>document.fonts.ready);
   if(view==='documents')await page.getByRole('searchbox',{name:'Tìm hồ sơ'}).waitFor();
   const scan=await geometry();results.push({view,width,...scan});
   await page.screenshot({path:`${output}/${view}-${width}.png`,fullPage:true});
   if(phase==='after'){assert.equal(scan.overflow,false);assert.deepEqual(scan.smallTargets,[]);}
  }
 }
 const counts={records:records.length,documents:new Set(records.flatMap(r=>r.documents.map(d=>d.id))).size,linked:records.filter(r=>r.linkedRecordId).length};
 if(phase==='after'){
  await page.setViewportSize({width:375,height:852});
  await nav.getByRole('link',{name:'Giấy tờ',exact:true}).click();
  assert.equal(await page.locator('#them-giay-to').evaluate(el=>el.open),false);
  const search=page.getByRole('searchbox',{name:'Tìm hồ sơ'});
  await search.fill('no-matching-record-synthetic');
  await page.getByRole('button',{name:'Xem tất cả hồ sơ',exact:true}).click();assert.equal(await search.inputValue(),'');
  results.push({case:'saved library starts closed, empty search can be reset'});
  await nav.getByRole('link',{name:'Tổng quan',exact:true}).click();
  const overview=page.getByRole('region',{name:'Tóm tắt thai kỳ'});
  assert.equal(await overview.locator('details[open]').count(),0);
  const disclosure=overview.locator(':scope > details > summary').first();
  await disclosure.focus();await page.keyboard.press('Enter');
  assert.equal(await disclosure.evaluate(el=>el.parentElement.open),true);
  await page.screenshot({path:`${output}/reading-open-375.png`,fullPage:true});
  assert.deepEqual((await geometry()).smallTargets,[]);
  await page.keyboard.press('Enter');
  await page.getByRole('link',{name:'Xem lần khám',exact:true}).click();
  await search.waitFor();assert.equal(await page.locator(':focus').getAttribute('id'),page.url().split('#')[1]);
  assert.equal(await page.locator('#them-giay-to').evaluate(el=>el.open),false);
  results.push({case:'collapsed disclosures, keyboard and direct record focus'});
  await page.getByRole('link',{name:'Thêm giấy tờ',exact:true}).click();
  await page.getByRole('button',{name:'Chụp giấy tờ',exact:true}).waitFor();
  assert.equal(await page.locator('input[aria-label="Chọn giấy tờ khám"]').getAttribute('multiple'),'');
  assert.equal(await page.locator('input[aria-label="Chụp giấy tờ khám"]').getAttribute('capture'),'environment');
  await page.screenshot({path:`${output}/upload-375.png`,fullPage:true});
  results.push({case:'explicit intake, multi-file picker and camera retained'});
  for(const [width,height,text] of [[852,393,'16px'],[375,852,'20px']]){
   await page.setViewportSize({width,height});await page.evaluate(text=>document.documentElement.style.fontSize=text,text);
   for(const label of ['Tổng quan','Giấy tờ','Lịch khám']){
    await nav.getByRole('link',{name:label,exact:true}).click();const scan=await geometry();assert.equal(scan.overflow,false);assert.deepEqual(scan.smallTargets,[]);
   }
   results.push({case:'landscape or larger text, reduced motion',width,height,text});
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:375,height:852});
  fixture=true;loadFailure=true;await page.goto(origin+'/me-bau/ho-so');
  await page.getByRole('button',{name:'Tải lại hồ sơ',exact:true}).waitFor();
  assert.equal(await page.getByText('Lưu lần khám đầu tiên',{exact:true}).count(),0);
  loadFailure=false;await page.getByRole('button',{name:'Tải lại hồ sơ',exact:true}).click();await overview.waitFor();
  results.push({case:'failed load is not empty, retry restores overview'});
  await nav.getByRole('link',{name:'Giấy tờ',exact:true}).click();
  await page.getByRole('button',{name:'Sửa',exact:true}).click();
  await page.getByRole('textbox',{name:'Tiêu đề',exact:true}).fill('Hồ sơ mẫu đã chỉnh');
  await page.screenshot({path:`${output}/edit-375.png`,fullPage:true});
  const save=page.locator('#medical-record-form button[type="submit"]');
  saveFailure=true;await save.click();
  await page.getByText('Chưa lưu hoặc tải hồ sơ được. Hãy kiểm tra mạng và thử lại.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Tiêu đề',exact:true}).inputValue(),'Hồ sơ mẫu đã chỉnh');
  saveFailure=false;await save.click();
  await page.getByRole('status').filter({hasText:'Đã lưu “Hồ sơ mẫu đã chỉnh”'}).waitFor();
  assert.equal(await page.locator('#medical-record-form').count(),0);assert.equal(saves,2);
  results.push({case:'mocked edit failure retains input; retry has a saved receipt',mockedSaves:saves});
 }
 await writeFile(`${output}/audit.json`,JSON.stringify({version,phase,counts,results,errors,mockedSaves:saves,realFamilyWrites:0},null,2));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({version,phase,counts,results,errors,realFamilyWrites:0}));
}finally{
 await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});
 await browser.close();
}
