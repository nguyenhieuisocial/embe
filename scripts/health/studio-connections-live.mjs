// Read-only connection check. No social account creation, uploads or posts.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
if(!process.env.EMBE_VERIFY_PASSWORD)throw new Error('missing_password');
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext();const page=await context.newPage();let logged=false;
try{
  await context.addInitScript(()=>localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now())));
  await page.goto(origin+'/studio');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(origin+'/studio',{timeout:45000});logged=true;
  const results=[];
  for(const width of [375,393,430,768,1280]){
    await page.setViewportSize({width,height:852});
    const section=page.locator('details').filter({has:page.locator('summary',{hasText:'Tài khoản mạng xã hội'})});
    if(!await section.evaluate(el=>el.open))await section.locator('summary').click();
    await section.getByRole('button',{name:'Kiểm tra kết nối',exact:true}).click();
    await section.getByRole('status').filter({hasText:'Chưa cấu hình Postiz'}).waitFor();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('overflow_'+width);
    results.push({width,unconfiguredShown:true});
  }
  console.log(JSON.stringify({results,posted:false,browser:'Cent; not physical iPhone'}));
}finally{
  if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});
  await browser.close();
}
