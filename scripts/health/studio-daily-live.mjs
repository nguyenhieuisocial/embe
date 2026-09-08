// Read-only proof of the installed scheduler's real output. Never creates a job,
// changes settings, posts externally, or inspects family content.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia', password = process.env.EMBE_VERIFY_PASSWORD, version = process.env.EMBE_VERIFY_VERSION;
if (!password || !version) throw new Error('missing_config');
if ((await (await fetch(origin + '/api/health')).json()).version !== version) { console.log('deployment_pending'); process.exit(2); }
const dir = resolve('data/studio-daily-verification'); await mkdir(dir, { recursive:true });
const browser = await chromium.launch({ headless:true, executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport:{width:393,height:852}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
const page = await context.newPage(); page.setDefaultTimeout(25000);
const result = { version, browser:'isolated Cent, not physical iPhone/Safari', jobCreationRequests:0, socialPublished:false, viewports:[] };
let logged=false;
try {
  const denied = await context.request.get(origin + '/api/studio/automation', {maxRedirects:0});
  if (denied.status() !== 401 && !(denied.status() === 307 && denied.headers().location === '/login?next=%2Fapi%2Fstudio%2Fautomation')) throw new Error('unprotected_status');
  await page.goto(origin + '/studio', {waitUntil:'domcontentloaded'});
  await page.getByLabel('Mật khẩu', {exact:true}).fill(password);
  await page.getByRole('button', {name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin + '/studio', {timeout:45000}); logged=true;
  page.on('request', r => { if (r.method()==='POST' && /\/api\/studio\//.test(r.url())) result.jobCreationRequests++; });
  const panel=page.getByRole('region',{name:'Studio tự động'});
  await panel.getByRole('button',{name:'Tạm dừng',exact:true}).waitFor();
  const response = await context.request.get(origin+'/api/studio/automation');
  if(!response.ok() || !response.headers()['cache-control']?.includes('no-store')) throw new Error('status_failed');
  const status=await response.json();
  if(!status.enabled || status.publication.status!=='not_connected') throw new Error('incorrect_state');
  if(status.handoff?.status!=='ready'||status.handoff.pendingCount<1)throw new Error('automatic_handoff_missing');
  result.handoff=status.handoff;
  const first=status.history.find(item=>!item.deleted);
  if(first?.render_status!=='completed') throw new Error('render_not_complete');
  result.projectId=first.project_id;result.renderId=first.render_id;result.remaining=status.remaining;result.nextRunAt=status.nextRunAt;
  if(await panel.locator('video').getAttribute('autoplay')!==null) throw new Error('unexpected_autoplay');
  await panel.getByText('Chưa đăng lên mạng xã hội',{exact:true}).waitFor();
  const media=await context.request.get(origin+`/api/studio/renders/${first.render_id}/video`,{headers:{Range:'bytes=0-1023'}});
  if(media.status()!==206 || !media.headers()['content-type']?.includes('video/mp4') || (await media.body()).length!==1024) throw new Error('video_range_failed');
  result.videoRange=true;
  const video=panel.locator('video');await video.evaluate(v=>v.load());
  await page.waitForFunction(()=>{const v=document.querySelector('.studio-automation video');return v&&v.readyState>=1&&v.videoWidth>0;});
  result.video=await video.evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]) {
    await page.setViewportSize({width,height});
    const layout=await panel.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
      small:[...el.querySelectorAll('button,a,summary')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.height<43.5||r.width<43.5;}).map(n=>n.textContent?.trim().slice(0,60))}));
    result.viewports.push({width,...layout});if(layout.overflow||layout.small.length)throw new Error('mobile_layout');
  }
  await page.setViewportSize({width:393,height:852});await panel.screenshot({path:resolve(dir,'studio-automatic-iphone.png')});
  // No click/refresh signal: status must update from the visible-page timer.
  await page.waitForResponse(r=>r.url()===origin+'/api/studio/automation'&&r.request().method()==='GET'&&r.status()===200,{timeout:22000});
  result.automaticRefresh=true;
  await page.goto(origin+`/studio/duyet-dang?du-an=${first.project_id}`,{waitUntil:'domcontentloaded'});
  const detail=page.getByRole('region',{name:'Chi tiết yêu cầu duyệt'});
  await detail.getByText(/EmBe tự chuyển bản dựng này vào hàng chờ/).waitFor();
  const reviewVideo=detail.getByLabel('Video đúng bản yêu cầu duyệt',{exact:true});
  if(await reviewVideo.getAttribute('src')!==`/api/studio/renders/${first.render_id}/video`)throw new Error('wrong_review_video');
  if(await page.getByText('Thêm hoặc điều chỉnh yêu cầu thủ công',{exact:true}).evaluate(el=>el.closest('details').open))throw new Error('manual_form_not_collapsed');
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]) {
    await page.setViewportSize({width,height});
    const layout=await detail.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
      small:[...el.querySelectorAll('button,a,summary')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.height<43.5||r.width<43.5;}).map(n=>n.textContent?.trim().slice(0,60))}));
    result.viewports.push({page:'review',width,...layout});if(layout.overflow||layout.small.length)throw new Error('review_mobile_layout');
  }
  await page.setViewportSize({width:393,height:852});await detail.screenshot({path:resolve(dir,'studio-review-iphone.png')});
  result.automaticReviewOpen=true;
  await page.keyboard.press('Tab');result.keyboardFocus=await page.evaluate(()=>document.activeElement!==document.body);
  if(result.jobCreationRequests!==0)throw new Error('not_automatic');
  result.status='passed';
} catch(e) { result.status='failed';result.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'verification_failed';result.line=e.stack?.match(/studio-daily-live\.mjs:(\d+)/)?.[1];process.exitCode=1; }
finally {
  if(logged){const r=await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0});result.ownSessionRevoked=r.status()===303;}
  await writeFile(resolve(dir,'result.json'),JSON.stringify(result,null,2));await browser.close();
}
console.log(JSON.stringify(result));
