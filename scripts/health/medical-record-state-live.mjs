import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext(),page=await context.newPage();let logged=false;
try{
 await context.addInitScript(()=>localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now())));
 await page.goto(origin+'/me-bau/ho-so');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
 await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
 await page.waitForURL(origin+'/me-bau/ho-so',{timeout:45000});logged=true;
 const response=await context.request.get(origin+'/api/pregnancy/records');
 const data=await response.json();const records=data.records??[];
 const states={};let docs=0,fields=0,failedScans=0;
 for(const record of records)for(const document of record.documents??[]){
   docs++;states[document.scanStatus]=(states[document.scanStatus]??0)+1;
   const scan=await context.request.get(origin+`/api/pregnancy/documents/${document.id}/scan`);
   if(!scan.ok()){failedScans++;continue;}
   const payload=await scan.json();
   const analysis=payload.analysis??payload.scan?.analysis;
   for(const p of analysis?.pages??[])fields+=(p.fields?.length??0)+(p.medicines?.length??0)+(p.charges?.length??0);
 }
 console.log(JSON.stringify({status:response.status(),records:records.length,intakes:records.filter(r=>r.documentIntake).length,documents:docs,states,extractedRows:fields,failedScans}));
 if(docs){
   await page.getByText(/giấy tờ đã lưu · .*bản đọc sẵn sàng/).waitFor({timeout:30000});
   if(await page.getByText('Chưa có hồ sơ đã lưu',{exact:true}).count())throw new Error('false_empty_state');
 }
}finally{if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});await browser.close();}
