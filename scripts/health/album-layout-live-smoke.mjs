// Read-only album interaction; does not upload, react, edit, or download originals.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
if (!process.env.EMBE_VERIFY_PASSWORD) throw Error('password_missing');
const browser = await chromium.launch({headless:true, executablePath:'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context = await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at',String(Date.now())));
const page = await context.newPage(); let authenticated = false;
try {
  await page.goto(`${origin}/ky-niem`);
  await page.getByLabel('Mật khẩu',{exact:true}).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button',{name:'Vào sổ gia đình',exact:true}).click();
  await page.waitForURL(`${origin}/ky-niem`,{timeout:45000}); authenticated=true;
  await page.getByRole('searchbox',{name:'Tìm album'}).waitFor();
  for(const width of [375,393,430,412,768,1280]) {
    await page.setViewportSize({width,height:852});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw Error(`overview_overflow_${width}`);
  }
  await page.getByRole('searchbox',{name:'Tìm album'}).fill('___not_an_album___');
  await page.getByRole('button',{name:'Xóa tìm kiếm'}).click();
  const link = page.locator('.memory-album').first();
  await link.click();
  await page.getByRole('button',{name:'Nguyên khung'}).waitFor();
  for(const width of [375,393,430,412,768,1280]) {
    await page.setViewportSize({width,height:852});
    await page.getByRole('button',{name:'Nguyên khung'}).click();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) throw Error(`album_overflow_${width}`);
    const fit=await page.locator('.memory-album-grid img').first().evaluate(n=>getComputedStyle(n).objectFit);
    if(fit!=='contain')throw Error('cropped_full_layout');
    await page.getByRole('button',{name:'Lưới ảnh'}).click();
  }
  await page.setViewportSize({width:393,height:852});
  await page.getByRole('button',{name:'Nguyên khung'}).focus(); await page.keyboard.press('Enter');
  if(await page.locator('.memory-album-grid').getAttribute('data-layout')!=='full')throw Error('keyboard_layout');
  await mkdir('data/album-verification',{recursive:true});
  await page.locator('.memory-album-detail > header').screenshot({path:'data/album-verification/header.png'});
  console.log('Passed: search/clear, six viewport sizes, full-image contain, keyboard layout. Not physical iOS.');
} finally {
  if(authenticated)await context.request.post(`${origin}/api/auth/logout`,{headers:{origin},maxRedirects:0});
  await browser.close();
}
