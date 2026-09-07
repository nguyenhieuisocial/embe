// Finite proof with an original non-medical demo. No publishing or family data.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia',password=process.env.EMBE_VERIFY_PASSWORD,version=process.env.EMBE_VERIFY_VERSION;
if(!password||!version)throw new Error('missing_config');
if((await(await fetch(origin+'/api/health')).json()).version!==version)throw new Error('deployment_pending');
const dir=resolve('data/studio-auto-verification');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
const page=await context.newPage();page.setDefaultTimeout(20000);
const report={version,browser:'Cent iPhone viewport, not physical Safari',socialPublished:false,renderClicks:0,viewports:[]};
let logged=false;
const read=async path=>{const r=await context.request.get(origin+path);if(!r.ok())throw new Error('read_'+r.status());return r.json();};
try{
  await page.goto(origin+'/studio/soan',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/studio/soan',{timeout:45000});logged=true;
  await page.getByRole('heading',{name:'Giọng đọc tự động'}).waitFor();
  page.on('request',r=>{if(r.url().endsWith('/api/studio/workspace')&&r.method()==='POST'&&r.postDataJSON()?.action==='render')report.renderClicks++;});
  await page.getByRole('textbox',{name:'Tên nội dung',exact:true}).fill('Tự động kể chuyện — EmBe');
  await page.getByRole('button',{name:'Bỏ cảnh 3',exact:true}).click();
  await page.getByRole('button',{name:'Bỏ cảnh 2',exact:true}).click();
  await page.getByRole('textbox',{name:'Lời đọc cảnh 1',exact:true}).fill('EmBe cùng bạn lưu 2 điều nhỏ hôm nay: một nụ cười và một lời yêu thương.');
  await page.getByText('Caption & nguồn đối chiếu (0)',{exact:true}).click();
  await page.getByRole('button',{name:'Thêm nguồn',exact:true}).click();
  await page.getByRole('textbox',{name:'Tên nguồn 1',exact:true}).fill('VieNeu Turbo');
  await page.getByRole('textbox',{name:'Link nguồn 1',exact:true}).fill('https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo');
  await page.getByRole('button',{name:'Đã lưu',exact:true}).waitFor();
  const id=new URL(page.url()).searchParams.get('du-an');if(!id)throw new Error('not_autosaved');report.projectId=id;
  const saved=(await read('/api/studio/workspace?project='+id)).project;report.revision=saved.revision;
  if(!saved.payload.autoRender||saved.payload.voice.id!=='auto-south'||saved.payload.scenes[0].speechText)throw new Error('not_automatic');
  report.autoSaved=true;report.manualSpeechOverrides=false;
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,small:[...document.querySelectorAll('.studio-main button,.studio-main a,.studio-main select,.studio-main summary')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').filter(el=>{const b=el.getBoundingClientRect();return b.height<43.5||b.width<43.5;}).map(el=>el.textContent?.trim().slice(0,50))}));
    report.viewports.push({width,...layout});if(layout.overflow||layout.small.length)throw new Error('mobile_layout');
  }
  await page.setViewportSize({width:393,height:852});await page.locator('.studio-voice-panel').screenshot({path:resolve(dir,'automatic-voice-iphone.png')});
  await page.keyboard.press('Tab');report.keyboard=await page.evaluate(()=>document.activeElement!==document.body);
  await page.close();report.editorClosed=true;
  let job;const start=Date.now();
  while(Date.now()-start<180000){
    job=(await read('/api/studio/workspace?project='+id)).renders.find(r=>r.revision===saved.revision);
    if(job?.status==='failed')throw new Error('render_'+job.error);
    if(job?.status==='completed')break;
    await new Promise(r=>setTimeout(r,5000));
  }
  if(job?.status!=='completed'||!job.output.voiceCredit.automatic)throw new Error('no_automatic_render');
  const video=await context.request.get(origin+`/api/studio/renders/${job.id}/video`);
  if(!video.ok()||report.renderClicks!==0)throw new Error('no_video');
  await writeFile(resolve(dir,'automatic-video.mp4'),await video.body());
  report.render={id:job.id,duration:job.output.duration,wallSeconds:Math.round((Date.now()-start)/1000),credit:job.output.voiceCredit};
  report.status='passed';
}catch(e){report.status='failed';report.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'verification_failed';report.line=e.stack?.match(/studio-auto-live\.mjs:(\d+)/)?.[1];if(!page.isClosed())await page.screenshot({path:resolve(dir,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{if(logged){const r=await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0});report.ownSessionRevoked=r.status()===303;}await writeFile(resolve(dir,'result.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
