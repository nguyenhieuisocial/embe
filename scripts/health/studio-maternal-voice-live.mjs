// Synthetic sample playback only; no project writes or social publication.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
if(!process.env.EMBE_VERIFY_PASSWORD)throw new Error('missing_password');
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852}});
const page=await context.newPage();let logged=false;
try{
  await context.addInitScript(()=>localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now())));
  await page.goto(origin+'/studio');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/studio',{timeout:45000});logged=true;
  await page.getByText('Nghe giọng nữ miền Nam mới',{exact:true}).click();
  await page.getByLabel('Giọng nghe thử').selectOption('thuc-doan-maternal-preview');
  await page.getByRole('button',{name:'Nghe mẫu Thục Đoan · nhịp nhẹ',exact:true}).click();
  await page.locator('audio').evaluate(async el=>{await el.play();});
  await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>.3);
  const duration=await page.locator('audio').evaluate(el=>{el.pause();return el.duration;});
  const response=await context.request.get(origin+'/api/studio/voice-preview?voice=thuc-doan-maternal-preview',{headers:{range:'bytes=0-1'}});
  if(response.status()!==206||(await response.body()).length!==2)throw new Error('range_failed');
  console.log(JSON.stringify({playback:true,duration,range:true,subjectiveListening:false}));
}finally{
  if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});
  await browser.close();
}
