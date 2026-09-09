import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext(),page=await context.newPage();let logged=false;
try {
 await context.addInitScript(()=>localStorage.setItem('embe:device-role','mother'));
 await page.goto(origin+'/');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
 await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
 await page.waitForURL(origin+'/',{timeout:45000});logged=true;
 // Fixture replaces only this view's GET response. No clinical writes.
 await page.route('**/api/pregnancy/care?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('days')!=='0')return route.continue();
  await route.fulfill({json:{snapshot:{plans:[{id:'fixture',name:'Thuốc thử giao diện có tên rất dài để kiểm tra xuống dòng',dose_display:'Liều thử giao diện',instructions:'Hướng dẫn thử giao diện dài để kiểm tra khả năng đọc đầy đủ trên điện thoại.',active:true,times_per_day:2,reminder_times:['08:00','20:00'],confirmed_by_clinician:true,dose_states:[{slot:1,status:'taken'}]}]}}});
 });
 await page.reload();
 const section=page.getByRole('region',{name:'Thuốc hôm nay'});
 await section.locator('.today-medication').first().waitFor();
 await mkdir('data/today-medications-verification',{recursive:true});
 for(const width of [375,393,768,1280]){
  await page.setViewportSize({width,height:852});
  const boxes=await section.locator('.today-medication-copy').evaluateAll(nodes=>nodes.map(el=>({width:el.getBoundingClientRect().width,overflow:el.scrollWidth>el.clientWidth+1})));
  if(boxes.some(b=>b.width<200||b.overflow))throw new Error('cramped_medication_'+width);
  if(await section.evaluate(el=>el.scrollWidth>el.clientWidth+1))throw new Error('overflow_'+width);
  await section.screenshot({path:`data/today-medications-verification/${width}.png`});
 }
 console.log(JSON.stringify({fixtureOnly:true,viewports:4,fullWidthMedicationText:true,overflow:false}));
}finally{if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});await browser.close();}
