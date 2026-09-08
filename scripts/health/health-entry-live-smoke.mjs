// Isolated synthetic health responses; never writes family health data.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
if (!process.env.EMBE_VERIFY_PASSWORD) throw Error('missing_verification_password');
const browser = await chromium.launch({headless:true, executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context = await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now())));
const page = await context.newPage(); let authenticated = false; let writes = 0;
try {
  await page.route('**/api/pregnancy/health?*', route => route.fulfill({json:{history:[]}}));
  await page.route('**/api/pregnancy/care?*', route => route.fulfill({json:{profile:{}}}));
  await page.route('**/api/pregnancy/health', async route => {
    if (route.request().method() !== 'PATCH') return route.fulfill({json:{history:[]}});
    writes++;
    await route.fulfill({json:{metric:route.request().postDataJSON()}});
  });
  await page.goto(`${origin}/me-bau/suc-khoe`);
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(`${origin}/me-bau/suc-khoe`,{timeout:45000}); authenticated = true;
  await page.getByRole('heading',{name:'Ghi sức khỏe',exact:true}).waitFor();
  await mkdir('data/health-entry-verification',{recursive:true});
  for (const width of [375,393,430,412,768,1280]) {
    await page.setViewportSize({width,height:852});
    for (const open of [false,true]) {
      await page.locator('.health-extra').evaluateAll((nodes,open) => nodes.forEach(n => n.open=open),open);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) throw Error(`overflow_${width}_${open}`);
    }
  }
  await page.setViewportSize({width:393,height:852});
  await page.locator('.health-extra').evaluateAll(nodes => nodes.forEach(n => n.open=false));
  await page.screenshot({path:'data/health-entry-verification/mobile.png',fullPage:true});
  const weight = page.getByLabel('Cân nặng (kg)');
  await weight.focus(); await page.keyboard.type('56');
  await page.keyboard.press('Tab');
  if (!await page.getByLabel('Giấc ngủ (giờ)').evaluate(n => n === document.activeElement)) throw Error('keyboard_order');
  await page.getByRole('button',{name:'Lưu sức khỏe hôm nay'}).click();
  await page.getByRole('button',{name:'Sửa thông tin hôm nay'}).waitFor();
  if (writes !== 1) throw Error('unexpected_synthetic_write_count');
  console.log('Passed: 6 viewport sizes, collapsed/expanded overflow, keyboard order, synthetic save. Not physical iOS.');
} finally {
  if (authenticated) await context.request.post(`${origin}/api/auth/logout`,{headers:{origin},maxRedirects:0});
  await browser.close();
}
