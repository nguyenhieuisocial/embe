// Finite live check, original synthetic voice demo only. No health records or social posts.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia',password=process.env.EMBE_VERIFY_PASSWORD,version=process.env.EMBE_VERIFY_VERSION;
if(!password||!version)throw new Error('missing_config');
const health=await(await fetch(origin+'/api/health')).json();
if(health.version!==version){console.log(JSON.stringify({status:'deployment_pending',version:health.version}));process.exit(2);}
const dir=resolve('data/studio-quality-v2-verification');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
const page=await context.newPage();page.setDefaultTimeout(25000);
const result={version,browser:'Cent isolated; iPhone viewport, not physical Safari',samples:[],viewports:[],socialPublished:false};
const id='97b1cd89-3750-4ff6-a6c9-6c49db9f8872',title='Nghe giọng kể chuyện mới — EmBe';
const text='Chào bạn, mình là giọng đọc của EmBe. Mỗi ngày một điều nhỏ, cùng mẹ chăm sóc bản thân thật nhẹ nhàng.';
let logged=false;
const read=async path=>{const r=await context.request.get(origin+path);if(!r.ok())throw new Error('read_'+r.status());return r.json();};
try {
  for(const voice of ['thuc-doan-south-v2','my-duyen-south-v2']){
    const r=await context.request.get(origin+'/api/studio/voice-preview?voice='+voice,{maxRedirects:0});
    if(![303,307,401].includes(r.status()))throw new Error('anonymous_access');
  }
  await page.goto(origin+'/studio',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/studio',{timeout:45000});logged=true;
  await page.getByText('Nghe giọng nữ miền Nam mới',{exact:true}).click();
  for(const [voice,name] of [['thuc-doan-south-v2','Thục Đoan'],['my-duyen-south-v2','Mỹ Duyên'],['kim-thanh-south-v2','Kim Thanh']]){
    await page.getByLabel('Giọng nghe thử').selectOption(voice);
    await page.getByRole('button',{name:'Nghe mẫu '+name,exact:true}).click();
    const audio=page.locator('audio');
    await audio.evaluate(async el=>{await el.play();});
    await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>.2);
    await audio.evaluate(el=>el.pause());
    const r=await context.request.get(origin+'/api/studio/voice-preview?voice='+voice,{headers:{range:'bytes=0-1'}});
    if(r.status()!==206||(await r.body()).length!==2)throw new Error('range');
    result.samples.push({voice,played:true,range:true});
  }
  const invalid=await context.request.get(origin+'/api/studio/voice-preview?voice=constructor');if(invalid.status()!==400)throw new Error('invalid_voice');
  for(const slug of ['bua-an-an-toan-3-dieu','bua-nho-khi-nghen','vi-chat-khong-chia-theo-thang']){
    const r=await context.request.get(origin+`/api/studio/${slug}/video`,{headers:{range:'bytes=0-1'}});
    if(r.status()!==206)throw new Error('catalog_video');
  }
  const existing=await context.request.get(origin+`/api/studio/workspace?project=${id}`);
  let project;
  if(existing.status()===404){
    const r=await context.request.post(origin+'/api/studio/workspace',{headers:{origin},data:{action:'save',id,revision:0,payload:{title,stage:'Nghe thử giọng AI',caption:'Mẫu tự viết. Không phải nội dung y tế, không đăng mạng xã hội.',voice:{id:'thuc-doan-south-v2',speed:1},scenes:[{heading:'Cùng mẹ, thật nhẹ nhàng',text}],sources:[{title:'VieNeu Turbo',url:'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo'}]}}});
    if(!r.ok())throw new Error('create_demo');project=(await r.json()).project;
  }else if(existing.ok()){
    project=(await existing.json()).project;
    if(project.payload.title!==title||project.payload.scenes.length!==1||project.payload.scenes[0].text!==text)throw new Error('demo_changed_do_not_overwrite');
  }else throw new Error('demo_unavailable');
  await page.goto(origin+`/studio/soan?du-an=${id}`,{waitUntil:'domcontentloaded'});
  await page.getByLabel('Chọn giọng').selectOption('my-duyen-south-v2');
  await page.getByRole('button',{name:'Nghe mẫu Mỹ Duyên'}).waitFor();
  await page.getByLabel('Chọn giọng').selectOption('thuc-doan-south-v2');
  const speed=project.payload.voice.speed===.95?1.05:.95;
  await page.getByLabel('Tốc độ đọc').selectOption(String(speed));
  await page.getByRole('button',{name:'Nghe mẫu Thục Đoan'}).click();
  await page.locator('audio').evaluate(async el=>{await el.play();});
  await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>.2);
  result.previewSpeed=await page.locator('audio').evaluate(el=>{el.pause();return el.playbackRate;});
  if(result.previewSpeed!==speed)throw new Error('preview_speed');
  await page.locator('summary').filter({hasText:'Chỉnh phát âm'}).first().click();
  const speechText='Chào bạn, mình là giọng đọc của Em Bé.\n\nMỗi ngày một điều nhỏ, cùng mẹ chăm sóc bản thân thật nhẹ nhàng.';
  await page.getByLabel('Lời đọc riêng cảnh 1',{exact:true}).fill(speechText);
  await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();
  await page.getByText('Đã lưu trên EmBe. Điện thoại khác có thể mở bản này.').waitFor();
  project=(await read(`/api/studio/workspace?project=${id}`)).project;
  if(project.payload.voice.id!=='thuc-doan-south-v2'||project.payload.voice.speed!==speed||project.payload.scenes[0].text!==text||project.payload.scenes[0].speechText!==speechText)throw new Error('voice_not_saved');
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,small:[...document.querySelectorAll('.studio-main button,.studio-main a,.studio-main select,.studio-main summary')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').filter(el=>{const b=el.getBoundingClientRect();return b.height<43.5||b.width<43.5;}).map(el=>el.textContent?.trim().slice(0,50))}));
    result.viewports.push({width,...layout});if(layout.overflow||layout.small.length)throw new Error('mobile_layout');
  }
  await page.setViewportSize({width:393,height:852});
  await page.locator('.studio-voice-panel').screenshot({path:resolve(dir,'voice-picker-iphone.png')});
  await page.keyboard.press('Tab');result.keyboard=await page.evaluate(()=>document.activeElement!==document.body);if(!result.keyboard)throw new Error('keyboard');
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Dựng video có giọng Việt',exact:true}).click();
  await page.getByText('Đã gửi yêu cầu dựng. Bạn có thể rời trang rồi quay lại xem kết quả.').waitFor();
  const start=Date.now();let job;
  while(Date.now()-start<150000){
    job=(await read(`/api/studio/workspace?project=${id}`)).renders.find(r=>r.revision===project.revision);
    if(job?.status==='failed')throw new Error('render_'+job.error);
    if(job?.status==='completed')break;
    await new Promise(r=>setTimeout(r,5000));
  }
  if(job?.status!=='completed'||!job.output.voiceCredit.attribution.includes('Thục Đoan'))throw new Error('render_missing');
  const video=await context.request.get(origin+`/api/studio/renders/${job.id}/video`);if(!video.ok())throw new Error('render_download');
  await writeFile(resolve(dir,'live-render.mp4'),await video.body());
  result.render={id:job.id,projectId:id,revision:project.revision,duration:job.output.duration,wallSeconds:Math.round((Date.now()-start)/1000)};
  if(job.output.voiceCredit.processingVersion!==2)throw new Error('old_worker');
  const subtitles=await context.request.get(origin+`/api/studio/renders/${job.id}/subtitles`);
  if(!subtitles.ok()||!/^00:\d{2}:\d{2}\.\d{3} --> 00:\d{2}:\d{2}\.\d{3}$/m.test(await subtitles.text()))throw new Error('subtitle_timing');
  const script=await context.request.get(origin+`/api/studio/renders/${job.id}/script`);
  if(!script.ok()||!(await script.text()).includes('Lời đọc riêng: '+speechText))throw new Error('script_missing_pronunciation');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel('Chọn giọng').waitFor();
  await page.locator('summary').filter({hasText:'Chỉnh phát âm'}).first().click();
  if(await page.getByLabel('Lời đọc riêng cảnh 1',{exact:true}).inputValue()!==speechText)throw new Error('pronunciation_not_saved');
  if(await page.getByLabel('Tốc độ đọc').inputValue()!==String(speed))throw new Error('reload_voice');
  result.status='passed';
}catch(e){result.status='failed';result.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'verification_failed';result.line=e.stack?.match(/studio-quality-v2-live\.mjs:(\d+)/)?.[1];await page.screenshot({path:resolve(dir,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{if(logged){const r=await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0});result.ownSessionRevoked=r.status()===303;}await writeFile(resolve(dir,'result.json'),JSON.stringify(result,null,2));await browser.close();}
console.log(JSON.stringify(result));
