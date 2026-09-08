// Read-only mobile layout verification; never submits a meal or changes family data.
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
if(!process.env.EMBE_VERIFY_PASSWORD)throw new Error('missing_password');
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext();const page=await context.newPage();let logged=false;
try{
  await context.addInitScript(()=>localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now())));
  await page.goto(origin+'/me-bau/bua-an');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/me-bau/bua-an',{timeout:45000});logged=true;
  await page.getByText('Mẹ vừa ăn gì?',{exact:true}).waitFor();
  const results=[];
  for(const [width,height] of [[375,812],[393,852],[430,932],[852,393],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('overflow_'+width);
    const sizes=await page.locator('.meal-photo-actions label').evaluateAll(items=>items.map(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})));
    if(sizes.some(s=>s.height<44||s.width<44))throw new Error('touch_target');
    const before=await page.locator('.meal-capture-card').evaluate(el=>{
      const action=el.querySelector('.health-save'),suggestion=el.querySelector('.care-inline');
      return !!(action.compareDocumentPosition(suggestion)&Node.DOCUMENT_POSITION_FOLLOWING);
    });
    if(!before)throw new Error('primary_action_order');
    results.push({width,height,targets:true,primaryBeforeSuggestions:true});
  }
  await page.setViewportSize({width:393,height:852});
  await page.getByLabel('Ghi chú món ăn · có thể lưu không cần ảnh',{exact:true}).focus();
  await page.keyboard.type('Một bát cơm, canh bí đỏ');
  if(!await page.getByRole('button',{name:'Nhận diện từ ghi chú',exact:true}).isEnabled())throw new Error('text_entry');
  await page.getByLabel('Ghi chú món ăn · có thể lưu không cần ảnh',{exact:true}).fill('');
  await mkdir('data/meal-layout-verification',{recursive:true});
  await page.screenshot({path:'data/meal-layout-verification/mobile.png',fullPage:true});
  console.log(JSON.stringify({results,textEntry:true,submitted:false,browser:'Cent; not physical iPhone'}));
}finally{
  if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});
  await browser.close();
}
