import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://embe.hieu.asia';
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context=await browser.newContext(),page=await context.newPage();let logged=false;
try {
 await context.addInitScript(()=>localStorage.setItem('embe:device-role','mother'));
 await page.goto(origin+'/me-bau/ho-so');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
 await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
 await page.waitForURL(origin+'/me-bau/ho-so',{timeout:45000});logged=true;
 await page.getByRole('button',{name:'Tự nhập',exact:true}).click();
 const form=page.locator('#medical-record-form');
 await form.waitFor();
 await form.locator('.medical-measurements > summary').click();
 await form.locator('.medical-measurements > details > summary').filter({hasText:'Số đo khi khám'}).click();
 await mkdir('data/medical-form-verification',{recursive:true});
 for(const width of [375,393,768,1280]){
  await page.setViewportSize({width,height:852});
  if(await form.evaluate(el=>el.scrollWidth>el.clientWidth+1))throw new Error('form_overflow_'+width);
  const measurement=await form.getByLabel('Chiều cao Mẹ (cm)',{exact:true}).boundingBox();
  if(!measurement||measurement.height<44||measurement.width<100)throw new Error('measurement_input_small');
  const buttons=await form.locator('.medical-kind-picker button').evaluateAll(nodes=>nodes.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
  if(buttons.some(b=>b.w<44||b.h<44))throw new Error('small_type_target');
 }
 await page.setViewportSize({width:393,height:852});
 await form.screenshot({path:'data/medical-form-verification/form.png'});
 const extra=form.locator('.medical-form-extra').first();
 if(await extra.evaluate(el=>el.open))throw new Error('extra_started_open');
 await extra.locator('summary').focus();await page.keyboard.press('Enter');
 await form.getByLabel('Bác sĩ',{exact:true}).fill('Kiểm tra giao diện — không lưu');
 await extra.locator('summary').click();await extra.locator('summary').click();
 if(await form.getByLabel('Bác sĩ',{exact:true}).inputValue()!=='Kiểm tra giao diện — không lưu')throw new Error('draft_lost');
 await form.getByRole('button',{name:'Đơn thuốc',exact:true}).click();
 await form.getByLabel('Tên thuốc',{exact:true}).waitFor();
 console.log(JSON.stringify({viewports:4,overflow:false,keyboard:true,draftPreserved:true,clinicalWrites:0}));
}finally{if(logged)await context.request.post(origin+'/api/auth/logout',{headers:{origin},maxRedirects:0}).catch(()=>{});await browser.close();}
