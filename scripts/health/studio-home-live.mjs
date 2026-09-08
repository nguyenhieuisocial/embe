import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
if(!process.env.EMBE_VERIFY_PASSWORD)throw new Error('missing_password');
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:393,height:852}}),page=await context.newPage();let logged=false;
try{
  await context.addInitScript(()=>localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now())));
  await page.goto(origin+'/studio');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/studio',{timeout:45000});logged=true;
  await page.getByRole('heading',{name:'Studio của EmBe',exact:true}).waitFor();
  await mkdir('data/studio-home-verification',{recursive:true});
  const results=[];
  for(const [width,height] of [[393,852],[375,812],[430,932],[768,1024],[1280,900]]){
    await page.setViewportSize({width,height});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('overflow_'+width);
    const primary=page.getByRole('link',{name:'Tạo video mới'});
    if((await primary.boundingBox()).height<44)throw new Error('small_target');
    if(await page.locator('.studio-home-tools > details[open]').count())throw new Error('not_collapsed');
    await page.screenshot({path:`data/studio-home-verification/${width}.png`,fullPage:false});
    results.push(width);
  }
  await page.getByText('Tiến độ & tự động hóa',{exact:true}).click();
  await page.getByRole('heading',{name:'Studio tự động',exact:true}).waitFor();
  await page.getByText('Tiến độ & tự động hóa',{exact:true}).click();
  await page.getByRole('searchbox',{name:'Tìm chủ đề'}).fill('zzzz-no-match');
  await page.getByRole('button',{name:'Xóa bộ lọc'}).click();
  if(await page.getByRole('searchbox',{name:'Tìm chủ đề'}).inputValue())throw new Error('reset_filter');
  console.log(JSON.stringify({widths:results,disclosures:true,search:true,dataWrites:false,browser:'Cent; not physical iPhone'}));
}finally{
  if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});
  await browser.close();
}
