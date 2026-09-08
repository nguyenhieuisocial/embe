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
 await page.setViewportSize({width:393,height:852});
 await page.screenshot({path:'data/medical-workspace-verification/overview.png',fullPage:true});
 await nav.getByRole('link',{name:'Lịch khám',exact:true}).click();
 if(!await page.locator('#lich-kham-ke-tiep').evaluate(el=>el.open))throw new Error('visit_not_open');
 const targets=await nav.locator('a').evaluateAll(links=>links.map(link=>({width:link.getBoundingClientRect().width,height:link.getBoundingClientRect().height})));
 if(targets.some(t=>t.width<44||t.height<44))throw new Error('small_nav_target');
 await nav.getByRole('link',{name:'Giấy tờ',exact:true}).focus();await page.keyboard.press('Enter');await search.waitFor();
 console.log(JSON.stringify({viewports:5,overflow:false,searchReset:true,sections:3,keyboard:true}));
}finally{if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});await browser.close();}
