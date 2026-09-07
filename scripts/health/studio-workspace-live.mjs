// Live private Studio workflow. Edits only the explicitly named demo editorial project.
// No health records, social publication, real user session revocation or visible windows.
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia',password=process.env.EMBE_VERIFY_PASSWORD,version=process.env.EMBE_VERIFY_VERSION;
if(!password||!version)throw new Error('missing_verification_config');
const health=await(await fetch(`${origin}/api/health`)).json();if(health.version!==version){console.log(JSON.stringify({status:'deployment_pending',version:health.version}));process.exit(2);}
const output=resolve('data/studio-workspace-verification');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(20000);
const result={version,browser:'Cent isolated headless; not a physical iPhone',viewports:[],nativeShareVerified:false,socialPublished:false};let logged=false;
const projectId='e785c076-5a64-461e-93f9-e51ae728b445';let second;
try{
  const anon=await context.request.get(`${origin}/api/studio/workspace`,{maxRedirects:0});if(anon.status()===200)throw new Error('anonymous_access');
  await page.goto(`${origin}/studio`,{waitUntil:'domcontentloaded'});await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();await page.waitForURL(`${origin}/studio`,{timeout:45000});logged=true;
  await page.getByRole('link',{name:'Mở bàn làm việc',exact:true}).click();await page.getByRole('heading',{name:'Bàn làm việc',exact:true}).waitFor();await page.getByRole('link',{name:/Bữa nhỏ khi nghén/}).waitFor();
  const forbidden=await context.request.post(`${origin}/api/studio/workspace`,{headers:{origin:'https://example.invalid'},data:{action:'save',id:projectId,revision:0,payload:{}}});if(forbidden.status()!==403)throw new Error('csrf_not_denied');
  await page.goto(`${origin}/studio/soan?du-an=${projectId}`,{waitUntil:'domcontentloaded'});await page.getByLabel('Tên nội dung',{exact:true}).waitFor();
  const before=await(await context.request.get(`${origin}/api/studio/workspace?project=${projectId}`)).json();
  await page.getByLabel('Tên nội dung',{exact:true}).fill('Bữa nhỏ khi nghén — cùng EmBe');
  await page.getByLabel('Tiêu đề cảnh 1',{exact:true}).fill('Một bữa nhỏ, mẹ dễ chịu hơn');
  await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await page.getByText('Đã lưu trên EmBe. Điện thoại khác có thể mở bản này.').waitFor();
  const updated=await(await context.request.get(`${origin}/api/studio/workspace?project=${projectId}`)).json();if(updated.project.revision<=before.project.revision)throw new Error('save_revision_missing');result.savedRevision=updated.project.revision;
  second=await browser.newContext({storageState:await context.storageState(),viewport:{width:375,height:667},isMobile:true,hasTouch:true});const other=await second.newPage();await other.goto(`${origin}/studio/soan?du-an=${projectId}`,{waitUntil:'domcontentloaded'});await other.getByLabel('Tên nội dung',{exact:true}).waitFor();if(await other.getByLabel('Tên nội dung',{exact:true}).inputValue()!=='Bữa nhỏ khi nghén — cùng EmBe')throw new Error('second_context_stale');result.crossContextRead=true;
  const conflict=await context.request.post(`${origin}/api/studio/workspace`,{headers:{origin},data:{action:'save',id:projectId,revision:before.project.revision,payload:{...before.project.payload,title:'MUST NOT REPLACE'}}});if(conflict.status()!==409)throw new Error('revision_conflict_missing');
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Dựng video có giọng Việt',exact:true}).click();await page.getByText('Đã gửi yêu cầu dựng. Bạn có thể rời trang rồi quay lại xem kết quả.').waitFor();
  let job;const started=Date.now();while(Date.now()-started<240000){const data=await(await context.request.get(`${origin}/api/studio/workspace?project=${projectId}`)).json();job=data.renders.find(r=>r.revision===updated.project.revision);if(job?.status==='failed')throw new Error('render_'+job.error);if(job?.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,4000));}
  if(job?.status!=='completed')throw new Error('render_timeout');result.render={id:job.id,duration:job.output.duration,wallSeconds:Math.round((Date.now()-started)/1000)};
  await page.getByRole('button',{name:'Cập nhật tiến độ',exact:true}).click();await page.locator('.studio-render-result video').first().waitFor();
  const media=`${origin}/api/studio/renders/${job.id}/video`;const full=await context.request.get(media);if(full.status()!==200)throw new Error('video_unavailable');const bytes=await full.body();result.render.bytes=bytes.length;result.render.sha256=createHash('sha256').update(bytes).digest('hex');
  const range=await context.request.get(media,{headers:{range:'bytes=0-1'}});if(range.status()!==206||(await range.body()).length!==2)throw new Error('range_failed');
  const video=page.locator('.studio-render-result video').first();await video.evaluate(async el=>{await el.play();});await page.waitForFunction(()=>document.querySelector('.studio-render-result video')?.currentTime>0.2);await video.evaluate(el=>el.pause());result.render.played=true;
  const subtitles=await context.request.get(`${origin}/api/studio/renders/${job.id}/subtitles`);if(!(await subtitles.text()).startsWith('WEBVTT'))throw new Error('subtitles_missing');
  const script=await context.request.get(`${origin}/api/studio/renders/${job.id}/script`);if(!(await script.text()).includes('Một bữa nhỏ, mẹ dễ chịu hơn'))throw new Error('script_revision_wrong');
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth+1,small:[...document.querySelectorAll('.studio-main button,.studio-main a,.studio-main input,.studio-main select,.studio-main summary')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').filter(el=>{const b=el.getBoundingClientRect();return b.height<43.5||b.width<43.5;}).map(el=>el.textContent?.trim().slice(0,45))}));result.viewports.push({width,height,...layout});if(layout.overflow||layout.small.length)throw new Error('mobile_layout_failed');}
  await page.setViewportSize({width:393,height:852});await page.screenshot({path:resolve(output,'editor-iphone.png'),fullPage:true});
  await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__studioShared={size:data.files[0].size,type:data.files[0].type};}});});
  await page.getByRole('button',{name:'Chuẩn bị chia sẻ',exact:true}).first().click();await page.getByRole('button',{name:'Chia sẻ file video',exact:true}).click();await page.waitForFunction(()=>window.__studioShared?.size>0);result.shareFile=await page.evaluate(()=>window.__studioShared);
  await page.goto(`${origin}/studio/kham-pha`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:/Sổ ý tưởng/}).waitFor();const board=await(await context.request.get(`${origin}/api/studio/workspace?board=1`)).json();result.notebookCloud=Number.isInteger(board.revision)&&Array.isArray(board.items);if(!result.notebookCloud)throw new Error('notebook_cloud_missing');
  await page.goto(`${origin}/studio/nghien-cuu`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Từ tham khảo đến nội dung EmBe',exact:true}).waitFor();result.researchAccessible=true;
  result.status='passed';
}catch(error){result.status='failed';result.error=/^[a-zA-Z0-9_]+$/.test(error.message)?error.message:'verification_failed';result.line=error.stack?.match(/studio-workspace-live\.mjs:(\d+)/)?.[1];await page.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{if(second)await second.close();if(logged){const logout=await context.request.post(`${origin}/api/auth/logout`,{headers:{origin},maxRedirects:0});result.ownSessionRevoked=logout.status()===303;}await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2));await browser.close();}
console.log(JSON.stringify(result));
