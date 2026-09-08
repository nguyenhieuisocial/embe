// Finite read-only check. No editing, render jobs, health data or social posts.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia',password=process.env.EMBE_VERIFY_PASSWORD,version=process.env.EMBE_VERIFY_VERSION;
const id='97b1cd89-3750-4ff6-a6c9-6c49db9f8872';
if(!password||!version)throw new Error('missing_config');
if((await(await fetch(origin+'/api/health')).json()).version!==version){console.log('deployment_pending');process.exit(2);}
const dir=resolve('data/studio-subtitles-verification');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(25000);
const result={version,browser:'isolated Cent; not physical iPhone or Safari',viewports:[],socialPublished:false};
let logged=false;
const check=async(path)=>{const r=await context.request.get(origin+path);if(!r.ok())throw new Error('read_'+r.status());return r;};
try {
  // Use a UUID route before login: auth must run before asset lookup.
  for(const kind of ['video','subtitles','subtitles?format=srt','caption']){
    const r=await context.request.get(origin+`/api/studio/renders/${id}/${kind}`,{maxRedirects:0});
    if(r.status()!==401&&!(r.status()===307&&r.headers().location?.startsWith('/login?')))throw new Error('anonymous_access');
  }
  await page.goto(origin+'/studio',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/studio',{timeout:45000});logged=true;
  const data=await(await check(`/api/studio/workspace?project=${id}`)).json();
  if(data.project.payload.title!=='Nghe giọng kể chuyện mới — EmBe')throw new Error('demo_identity');
  const render=data.renders.find(r=>r.revision===data.project.revision&&r.status==='completed'&&r.output?.captions?.burnedIn);
  if(!render)throw new Error('captioned_demo_not_ready');
  const cues=render.output.captions.cues;
  const base=`/api/studio/renders/${render.id}/`;
  const vttResponse=await check(base+'subtitles');const vtt=await vttResponse.text();
  const srt=await(await check(base+'subtitles?format=srt')).text();
  const caption=await(await check(base+'caption')).text();
  const stamp=(n,comma=false)=>{const ms=Math.round(n*1000);return `00:${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${comma?',':'.'}${String(ms%1000).padStart(3,'0')}`;};
  if(!vtt.startsWith('WEBVTT\n\n')||!vttResponse.headers()['content-type'].startsWith('text/vtt')||!vttResponse.headers()['cache-control'].includes('no-store'))throw new Error('vtt_format');
  if((vtt.match(/ --> /g)||[]).length!==cues.length||(srt.match(/ --> /g)||[]).length!==cues.length)throw new Error('cue_count');
  cues.forEach((cue,i)=>{
    if(cue.text.split('\n').length>2||!vtt.includes(`${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}`)||!srt.includes(`${i+1}\n${stamp(cue.start,true)} --> ${stamp(cue.end,true)}\n${cue.text}`))throw new Error('cue_content');
  });
  if(!caption.includes('Mẫu tự viết.')||!caption.includes('https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo')||!caption.includes('chưa duyệt chuyên môn'))throw new Error('caption_content');
  const invalid=await context.request.get(origin+base+'subtitles?format=html');if(invalid.status()!==400)throw new Error('invalid_format');
  const media=await context.request.get(origin+base+'video',{headers:{Range:'bytes=0-1023'}});
  if(media.status()!==206||(await media.body()).length!==1024)throw new Error('range');
  await page.goto(origin+`/studio/soan?du-an=${id}`,{waitUntil:'domcontentloaded'});
  const player=page.getByLabel(`Video phiên bản ${render.revision}`,{exact:true});
  await player.waitFor();
  if(await player.getAttribute('autoplay')!==null)throw new Error('autoplay');
  await player.evaluate(async el=>{el.muted=true;await el.play();});
  await page.waitForFunction(label=>[...document.querySelectorAll('video')].find(v=>v.getAttribute('aria-label')===label)?.currentTime>.2,`Video phiên bản ${render.revision}`);
  await player.evaluate((el,time)=>{el.pause();el.currentTime=time;},(cues[0].start+cues[0].end)/2);
  await page.waitForFunction(label=>{const v=[...document.querySelectorAll('video')].find(v=>v.getAttribute('aria-label')===label);return v&&!v.seeking&&v.readyState>=2;},`Video phiên bản ${render.revision}`);
  const card=player.locator('..');
  for(const name of ['Tải phụ đề VTT','Tải phụ đề SRT','Chú thích đăng bài'])await card.getByRole('link',{name,exact:true}).waitFor();
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});
    const layout=await card.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
      small:[...el.querySelectorAll('a,button')].filter(n=>n.getClientRects().length).some(n=>{const r=n.getBoundingClientRect();return r.width<43.5||r.height<43.5;})}));
    result.viewports.push({width,...layout});if(layout.overflow||layout.small)throw new Error('mobile_layout');
  }
  await page.setViewportSize({width:393,height:852});await card.screenshot({path:resolve(dir,'subtitles-iphone.png')});
  const link=card.getByRole('link',{name:'Tải phụ đề VTT',exact:true});await link.focus();await page.keyboard.press('Tab');
  result.keyboard=await card.getByRole('link',{name:'Tải phụ đề SRT',exact:true}).evaluate(el=>document.activeElement===el);
  if(!result.keyboard)throw new Error('keyboard');
  result.render={id:render.id,projectId:id,revision:render.revision,duration:render.output.duration,cues:cues.length,burnedIn:true,timing:render.output.captions.timing,played:true,range:true};
  result.status='passed';
}catch(e){result.status='failed';result.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'verification_failed';result.line=e.stack?.match(/studio-subtitles-live\.mjs:(\d+)/)?.[1];process.exitCode=1;}
finally{
  if(logged){const r=await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0});result.ownSessionRevoked=r.status()===303;}
  await writeFile(resolve(dir,'result.json'),JSON.stringify(result,null,2));await browser.close();
}
console.log(JSON.stringify(result));
