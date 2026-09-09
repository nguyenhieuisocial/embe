import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
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
 await page.getByRole('navigation',{name:'Đi nhanh trong hồ sơ'}).getByRole('link',{name:'Giấy tờ',exact:true}).click();
 await page.getByRole('searchbox',{name:'Tìm hồ sơ'}).waitFor({timeout:30000});
 await mkdir('data/medical-workspace-verification',{recursive:true});
 for(const width of [375,393,430,768,1280]){
  await page.setViewportSize({width,height:852});
  await page.evaluate(()=>window.scrollTo(0,0));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('horizontal_overflow_'+width);
  await page.screenshot({path:`data/medical-workspace-verification/${width}.png`,fullPage:true});
 }
 const search=page.getByRole('searchbox',{name:'Tìm hồ sơ'});
 await search.fill('no-matching-record-synthetic');
 await page.getByRole('button',{name:'Xem tất cả hồ sơ'}).click();
 if(await search.inputValue())throw new Error('search_not_reset');
 const nav=page.getByRole('navigation',{name:'Đi nhanh trong hồ sơ'});
 await nav.getByRole('link',{name:'Tổng quan',exact:true}).click();
 if(await search.isVisible())throw new Error('inactive_section_visible');
 await page.getByRole('region',{name:'Tóm tắt thai kỳ'}).waitFor();
 for(const [width,height] of [[375,812],[393,852],[430,932],[852,393],[768,1024],[1280,852]]){
  await page.setViewportSize({width,height});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('overview_overflow_'+width);
 }
 await page.setViewportSize({width:375,height:812});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>document.documentElement.style.fontSize='20px');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('large_text_overflow');
 await page.evaluate(()=>document.documentElement.style.fontSize='');
 const capture=page.getByRole('link',{name:'Thêm giấy tờ',exact:true});
 const captureBox=await capture.boundingBox();
 if(!captureBox||captureBox.height<44||captureBox.width<44)throw new Error('capture_target_small');
 const overview=page.getByRole('region',{name:'Tóm tắt thai kỳ'});
 if(await overview.locator('details[open]').count())throw new Error('overview_should_start_collapsed');
 const firstSummary=overview.locator(':scope > details > summary').first();
 await firstSummary.focus();await page.keyboard.press('Enter');
 if(!await firstSummary.evaluate(el=>el.parentElement.open))throw new Error('summary_keyboard_failed');
 await page.keyboard.press('Enter');
 const encounterChains=await page.locator('[aria-label="Chuỗi khám & tái khám"]').locator(':scope > details').evaluateAll(groups=>groups.map(group=>({
   documents:group.querySelectorAll('a[href*="/tai-lieu/"]').length,
   followups:group.querySelectorAll('time').length,
 })));
 const readingCounts=await page.getByRole('region',{name:'Tóm tắt thai kỳ'}).locator(':scope > details').evaluateAll(sections=>sections.slice(0,3).map(section=>({
   label:section.querySelector(':scope > summary')?.textContent,
   entries:section.querySelectorAll('article').length,
   sources:section.querySelectorAll('a[href*="/tai-lieu/"]').length,
 })));
 await page.setViewportSize({width:393,height:852});
 await page.screenshot({path:'data/medical-workspace-verification/overview.png',fullPage:true});
 await nav.getByRole('link',{name:'Lịch khám',exact:true}).click();
 if(!await page.locator('#lich-kham-ke-tiep').evaluate(el=>el.open))throw new Error('visit_not_open');
 const targets=await nav.locator('a').evaluateAll(links=>links.map(link=>({width:link.getBoundingClientRect().width,height:link.getBoundingClientRect().height})));
 if(targets.some(t=>t.width<44||t.height<44))throw new Error('small_nav_target');
 await nav.getByRole('link',{name:'Giấy tờ',exact:true}).focus();await page.keyboard.press('Enter');await search.waitFor();
 console.log(JSON.stringify({documentViewports:5,overviewViewports:6,largeText:true,reducedMotion:true,overflow:false,searchReset:true,sections:3,keyboard:true,readingCounts,encounterChains}));
}finally{if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});await browser.close();}
