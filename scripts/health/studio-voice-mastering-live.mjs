// Read-only live voice playback/phone-layout check. No family data or render jobs.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia',password=process.env.EMBE_VERIFY_PASSWORD,version=process.env.EMBE_VERIFY_VERSION;
if(!password||!version)throw new Error('missing_config');
if((await(await fetch(origin+'/api/health')).json()).version!==version){console.log('deployment_pending');process.exit(2);}
const dir=resolve('data/studio-voice-mastering-verification');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(25000);
const result={version,browser:'isolated Cent, not physical iPhone or Safari',samples:[],viewports:[],listeningAssessment:false};
let logged=false;
try{
  for(const voice of ['thuc-doan-south-v3','thuy-dung-south-v3']){
    const r=await context.request.get(origin+'/api/studio/voice-preview?voice='+voice,{maxRedirects:0});
    if(r.status()!==401&&!(r.status()===307&&r.headers().location?.startsWith('/login?')))throw new Error('unprotected_sample');
  }
  await page.goto(origin+'/studio',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/studio',{timeout:45000});logged=true;
  await page.getByText('Nghe giọng nữ miền Nam mới',{exact:true}).click();
  for(const [voice,name] of [['thuc-doan-south-v3','Thục Đoan'],['thuy-dung-south-v3','Thùy Dung']]){
    await page.getByLabel('Giọng nghe thử').selectOption(voice);
    await page.getByRole('button',{name:'Nghe mẫu '+name,exact:true}).click();
    const audio=page.locator('audio');
    if(await audio.getAttribute('autoplay')!==null)throw new Error('autoplay');
    await audio.evaluate(async el=>{await el.play();});
    await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>.2);
    const details=await audio.evaluate(el=>{el.pause();return {duration:el.duration,played:el.currentTime>0,preservesPitch:el.preservesPitch};});
    const media=await context.request.get(origin+'/api/studio/voice-preview?voice='+voice,{headers:{Range:'bytes=0-1023'}});
    if(media.status()!==206||(await media.body()).length!==1024)throw new Error('range_failed');
    result.samples.push({voice,...details,range:true});
  }
  const invalid=await context.request.get(origin+'/api/studio/voice-preview?voice=constructor');
  if(invalid.status()!==400)throw new Error('invalid_voice');
  await page.goto(origin+'/studio/soan',{waitUntil:'domcontentloaded'});
  const panel=page.getByRole('region',{name:'Giọng đọc',exact:true});
  await panel.getByRole('button',{name:'Nghe mẫu Thục Đoan',exact:true}).waitFor();
  if(await panel.locator('details').getAttribute('open')!==null)throw new Error('hidden_preview');
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});
    const layout=await panel.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
      small:[...el.querySelectorAll('button,summary')].filter(n=>n.getClientRects().length).some(n=>{const r=n.getBoundingClientRect();return r.width<43.5||r.height<43.5;})}));
    result.viewports.push({width,...layout});if(layout.overflow||layout.small)throw new Error('mobile_layout');
  }
  await page.setViewportSize({width:393,height:852});await panel.screenshot({path:resolve(dir,'voice-iphone.png')});
  result.status='passed';
}catch(e){result.status='failed';result.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'verification_failed';result.line=e.stack?.match(/studio-voice-mastering-live\.mjs:(\d+)/)?.[1];process.exitCode=1;}
finally{
  if(logged){const r=await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0});result.ownSessionRevoked=r.status()===303;}
  await writeFile(resolve(dir,'result.json'),JSON.stringify(result,null,2));await browser.close();
}
console.log(JSON.stringify(result));
