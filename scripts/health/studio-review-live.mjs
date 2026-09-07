// Finite production check of one synthetic editorial demo, never family health records or social posts.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia',password=process.env.EMBE_VERIFY_PASSWORD,version=process.env.EMBE_VERIFY_VERSION;
if(!password||!version)throw new Error('missing_config');
const health=await(await fetch(`${origin}/api/health`)).json();if(health.version!==version){console.log(JSON.stringify({status:'deployment_pending',version:health.version}));process.exit(2);}
const output=resolve('data/studio-review-verification');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(25000);
const id='40d58926-8849-4b2e-9d4d-e1b540860e82';let logged=false;
const result={version,browser:'Cent isolated headless, not physical iPhone/Safari',socialPublished:false,professionalApproved:false,viewports:[]};
const send=(path,body)=>context.request.post(origin+path,{headers:{origin},data:body});
const read=async path=>{const r=await context.request.get(origin+path);if(!r.ok())throw new Error(`read_${r.status()}`);return r.json();};
try{
  for(const path of ['/api/studio/review','/api/studio/voice-preview']){const r=await context.request.get(origin+path,{maxRedirects:0});if(![303,307,401].includes(r.status()))throw new Error('anonymous_access');}
  await page.goto(origin+'/studio',{waitUntil:'domcontentloaded'});await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();await page.waitForURL(origin+'/studio',{timeout:45000});logged=true;
  await page.getByRole('link',{name:'Duyệt & đăng',exact:true}).click();await page.getByRole('heading',{name:'Duyệt & đăng',exact:true}).waitFor();await page.getByText('Chưa bật đăng tự động',{exact:true}).waitFor();
  await page.getByText('Giọng nữ miền Nam',{exact:true}).click();await page.getByRole('button',{name:'Nghe mẫu Ái Hân',exact:true}).click();
  const audio=page.locator('audio');await audio.evaluate(async el=>{await el.play();});await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>.2);await audio.evaluate(el=>el.pause());result.previewPlayed=true;
  const range=await context.request.get(origin+'/api/studio/voice-preview',{headers:{range:'bytes=0-1'}});if(range.status()!==206||(await range.body()).length!==2)throw new Error('preview_range');
  const csrf=await context.request.post(origin+'/api/studio/review',{headers:{origin:'https://example.invalid'},data:{action:'approve',id,revision:1,note:''}});if(csrf.status()!==403)throw new Error('csrf');
  const prohibited=await send('/api/studio/review',{action:'approve',id,revision:1,note:''});if(prohibited.status()!==400)throw new Error('fake_approval');
  let current=await context.request.get(`${origin}/api/studio/workspace?project=${id}`);let project;
  if(current.status()===404){const saved=await send('/api/studio/workspace',{action:'save',id,revision:0,payload:{title:'Nghe giọng nữ miền Nam — EmBe',stage:'Bản nghe thử, không phải hướng dẫn y tế',caption:'Giọng AI Ái Hân, mẫu riêng của EmBe. Chưa duyệt chuyên môn, không đăng tự động.',voice:{id:'ai-han-south',speed:1},scenes:[{heading:'Cùng mẹ, thật nhẹ nhàng',text:'Chào bạn, mình là giọng đọc của EmBe. Mỗi ngày một điều nhỏ, cùng mẹ chăm sóc bản thân thật nhẹ nhàng.'}],sources:[{title:'VieNeu · nguồn giọng đọc',url:'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano'}]}});if(saved.status()!==200)throw new Error('save_demo');project=(await saved.json()).project;}
  else if(current.status()===200){project=(await current.json()).project;if(project.payload.title!=='Nghe giọng nữ miền Nam — EmBe')throw new Error('demo_changed_do_not_overwrite');}else throw new Error('project_unavailable');
  await page.goto(`${origin}/studio/soan?du-an=${id}`,{waitUntil:'domcontentloaded'});await page.getByLabel('Chọn giọng').waitFor();if(await page.getByLabel('Chọn giọng').inputValue()!=='ai-han-south')throw new Error('wrong_voice');
  await page.getByLabel('Tốc độ đọc').selectOption('0.95');await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();await page.getByText('Đã lưu trên EmBe. Điện thoại khác có thể mở bản này.').waitFor();project=(await read(`/api/studio/workspace?project=${id}`)).project;if(project.payload.voice.speed!==.95)throw new Error('voice_speed_not_saved');
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Dựng video có giọng Việt',exact:true}).click();await page.getByText('Đã gửi yêu cầu dựng. Bạn có thể rời trang rồi quay lại xem kết quả.').waitFor();
  let job;const started=Date.now();while(Date.now()-started<180000){const data=await read(`/api/studio/workspace?project=${id}`);job=data.renders.find(r=>r.revision===project.revision);if(job?.status==='failed')throw new Error('render_'+job.error);if(job?.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,5000));}
  if(job?.status!=='completed'||!job.output.voiceCredit.attribution.includes('Ái Hân'))throw new Error('southern_render_missing');result.render={id:job.id,duration:job.output.duration,wallSeconds:Math.round((Date.now()-started)/1000)};
  await page.goto(`${origin}/studio/duyet-dang?du-an=${id}`,{waitUntil:'domcontentloaded'});await page.getByLabel('Điều cần người duyệt lưu ý').waitFor();await page.getByLabel('Nơi đăng dự kiến').selectOption('youtube');await page.getByLabel('Điều cần người duyệt lưu ý').fill('Mẫu giọng đọc AI, chưa phải nội dung y tế được duyệt.');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Lưu yêu cầu duyệt',exact:true}).click();await page.getByText('Đã lưu vào hàng chờ trên EmBe. Chưa gửi cho bác sĩ, chưa đăng mạng xã hội.').waitFor();
  const q=(await read('/api/studio/review')).requests.find(q=>q.project_id===id&&q.project_revision===project.revision);if(!q||q.stale)throw new Error('review_not_saved');result.reviewId=q.id;
  await page.getByLabel('Ghi nhận góp ý',{exact:true}).fill('Cần nghe lại phát âm trên điện thoại; chưa có người duyệt chuyên môn.');await page.getByRole('button',{name:'Lưu góp ý',exact:true}).click();await page.getByText('Đã lưu góp ý. Đây chưa phải xác nhận chuyên môn.').waitFor();
  const detail=await read(`/api/studio/review?id=${q.id}`);if(detail.request.snapshot.voice.speed!==.95||detail.events.length<2)throw new Error('review_history_missing');
  const conflict=await send('/api/studio/review',{action:'comment',id:q.id,revision:1,note:'MUST NOT SAVE STALE COMMENT'});if(conflict.status()!==409)throw new Error('review_conflict');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Tải hồ sơ duyệt'}).click();const file=await download;await file.saveAs(resolve(output,'review-packet.txt'));result.packetDownloaded=true;
  // Reload proves notes are stored on EmBe, not only in component state.
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/Nghe giọng nữ miền Nam — EmBe/}).last().click();await page.getByText('Cần nghe lại phát âm trên điện thoại; chưa có người duyệt chuyên môn.',{exact:true}).waitFor();result.reviewPersisted=true;
  for(const [width,height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth+1,small:[...document.querySelectorAll('.studio-main button,.studio-main a,.studio-main input,.studio-main select,.studio-main summary')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').filter(el=>{const b=el.getBoundingClientRect();return b.height<43.5||b.width<43.5;}).map(el=>el.textContent?.trim().slice(0,40))}));result.viewports.push({width,...layout});if(layout.overflow||layout.small.length)throw new Error('mobile_layout');}
  await page.setViewportSize({width:393,height:852});await page.screenshot({path:resolve(output,'review-iphone.png'),fullPage:true});
  await page.keyboard.press('Tab');result.keyboardFocus=await page.evaluate(()=>document.activeElement!==document.body);if(!result.keyboardFocus)throw new Error('keyboard_focus');
  await page.getByRole('button',{name:'Rút yêu cầu',exact:true}).click();await page.getByRole('button',{name:'Xác nhận rút',exact:true}).click();await page.getByText('Đã rút yêu cầu. Lịch sử vẫn được giữ.').waitFor();result.cancellationPersisted=(await read(`/api/studio/review?id=${q.id}`)).request.status==='cancelled';if(!result.cancellationPersisted)throw new Error('cancellation');
  result.status='passed';
}catch(e){result.status='failed';result.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'verification_failed';result.line=e.stack?.match(/studio-review-live\.mjs:(\d+)/)?.[1];await page.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{if(logged){const r=await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0});result.ownSessionRevoked=r.status()===303;}await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2));await browser.close();}
console.log(JSON.stringify(result));
