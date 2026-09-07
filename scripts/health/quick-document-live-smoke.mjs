// Exercise only navigation/file pickers on live. Never select/upload a file,
// mutate a health record, or send a test push to family phones.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const expected = process.env.EMBE_VERIFY_VERSION; const password = process.env.EMBE_VERIFY_PASSWORD;
if (!expected || !password) throw new Error('missing_verification_config');
const health = await (await fetch(`${origin}/api/health?verify=${expected}&at=${Date.now()}`)).json();
if (health.version !== expected) { console.log(JSON.stringify({ pending: true, version: health.version })); process.exit(2); }
const output = resolve('data/quick-document-verification'); await mkdir(output, { recursive: true });
const result = { version: expected, noUploads: true, widths: [] };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
await context.route('**/api/notifications/activity**', route => route.fulfill({ json: { activities: [] } }));
// The test needs the upload entry, not family medical records.
await context.route('**/api/pregnancy/records', async route => {
  if (route.request().method() !== 'GET') throw new Error('unexpected_medical_write');
  return route.fulfill({ json: { records: [], insights: [] } });
});
const page = await context.newPage(); let loggedIn = false;
const writes = [];
context.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (['POST','PUT','PATCH','DELETE'].includes(request.method()) && /\/api\/pregnancy\/(intake|records|documents)/.test(path)) writes.push(path);
});
try {
  await page.goto(`${origin}/huong-dan`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/huong-dan`, { timeout: 45000 }); loggedIn = true;
  for (const [width, height] of [[375,667],[393,852],[430,932],[412,915],[768,1024],[1280,800]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Mở thao tác nhanh' }).click();
    const shortcut = page.getByRole('link', { name: /Chụp hoặc chọn giấy tờ/ });
    await shortcut.waitFor();
    const box = await shortcut.boundingBox();
    if (!box || box.height < 44 || box.y < 0 || box.y + box.height > height) throw new Error(`shortcut_unreachable_${width}`);
    if (width === 393) await page.getByRole('dialog', { name: 'Ghi nhanh' }).screenshot({ path: resolve(output, 'quick-document-menu.png') });
    await shortcut.focus(); await page.keyboard.press('Enter');
    await page.waitForURL(`${origin}/me-bau/ho-so#them-giay-to`);
    await page.getByRole('dialog', { name: 'Ghi nhanh' }).waitFor({ state: 'hidden' });
    const intake = page.locator('#them-giay-to');
    await page.waitForFunction(() => { const r = document.querySelector('#them-giay-to')?.getBoundingClientRect(); return r && r.top >= -1 && r.bottom <= innerHeight; });
    const metrics = await intake.evaluate(el => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
      locked: document.body.style.overflow === 'hidden', inert: Boolean(el.closest('[inert]')),
      badTargets: [...el.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length }));
    result.widths.push({ width, height, ...metrics });
    if (metrics.overflow || metrics.locked || metrics.inert || metrics.badTargets) throw new Error(`navigation_${width}`);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('#them-giay-to').screenshot({ path: resolve(output, 'quick-document-entry.png') });
  for (const [name, label, multiple, capture] of [['Chụp giấy tờ','Chụp giấy tờ khám',false,'environment'],['Chọn ảnh / PDF','Chọn giấy tờ khám',true,null]]) {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name, exact: true }).click();
    const chooser = await chooserPromise;
    if (chooser.isMultiple() !== multiple || await page.getByLabel(label, { exact: true }).getAttribute('capture') !== capture) throw new Error('incorrect_picker');
    await chooser.setFiles([]);
  }
  if (writes.length) throw new Error('unexpected_upload');
  result.cameraAndPickerOpened = true; result.keyboardPassed = true; result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error instanceof Error ? error.message : 'verification_failed'; }
finally {
  if (loggedIn) result.ownSessionRevoked = (await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303;
  await browser.close(); await writeFile(resolve(output, 'quick-document-live-result.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result)); if (result.status !== 'passed') process.exitCode = 1;
