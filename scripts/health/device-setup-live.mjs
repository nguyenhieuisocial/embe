import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext(),page=await context.newPage();let logged=false;
try {
 await context.addInitScript(()=>{localStorage.setItem('embe:device-role','mother');localStorage.setItem('embe:access-guide-dismissed-at','1');});
 await page.setViewportSize({width:393,height:852});
 await page.goto(origin+'/cai-dat');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
 await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
 await page.waitForURL(origin+'/cai-dat',{timeout:45000});logged=true;
 const edit=page.getByRole('button',{name:'Đổi người dùng · Mẹ Ngân'});
 await edit.waitFor({timeout:30000});
 if(await page.getByRole('dialog',{name:'Hoàn tất trên iPhone'}).count())throw new Error('setup_reopened');
 if(await page.getByRole('button',{name:'Điện thoại của Mẹ Ngân',exact:true}).count())throw new Error('owner_prompt_visible');
 for(const width of [393,768,1280]){
  await page.setViewportSize({width,height:852});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('overflow_'+width);
  const box=await edit.boundingBox();if(!box||box.height<44||box.width<44)throw new Error('small_target');
 }
 await edit.focus();await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Điện thoại của Mẹ Ngân',exact:true}).waitFor();
 await page.getByRole('button',{name:'Hủy',exact:true}).click();
 await page.reload();await edit.waitFor();
 if(await page.getByRole('button',{name:'Điện thoại của Mẹ Ngân',exact:true}).count())throw new Error('owner_prompt_returned');
 console.log(JSON.stringify({remembered:true,noRepeatedGuide:true,keyboardEdit:true,reload:true,viewports:3}));
} finally {if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});await browser.close();}
