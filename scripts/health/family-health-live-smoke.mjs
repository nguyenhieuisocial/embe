// Read-only live UI verification. All app writes except this session's login/logout are blocked.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const expected = process.env.EMBE_VERIFY_VERSION; const password = process.env.EMBE_VERIFY_PASSWORD;
if (!expected || !password) throw new Error('missing_verification_config');
const health = await (await fetch(`${origin}/api/health?verify=${expected}&at=${Date.now()}`)).json();
if (health.version !== expected) throw new Error('deployment_pending');
const output = resolve('data/family-health-verification'); await mkdir(output, { recursive: true });
const result = { version: expected, viewports: [], failures: [], ownSessionRevoked: false };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'vi-VN', serviceWorkers: 'block' });
const page = await context.newPage(); let loggedIn = false;
try {
  await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
  await context.route('**/api/**', async route => {
    const req = route.request();
    if (!['GET', 'HEAD'].includes(req.method()) && !['/api/auth/login', '/api/auth/logout'].includes(new URL(req.url()).pathname)) {
      result.failures.push('unexpected_app_write_blocked'); return route.abort();
    }
    return route.continue();
  });
  await page.goto(`${origin}/nha-minh/ho-so?tab=records`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/nha-minh/ho-so', { timeout: 45000 }); loggedIn = true;
  await page.getByRole('heading', { name: 'Hồ sơ sức khỏe gia đình' }).waitFor();
  await page.getByRole('button', { name: 'Thêm bệnh án / lần khám' }).click();
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Ví dụ khám tổng quát — không lưu');
  await page.locator('.member-record-editor summary').filter({ hasText: 'Chi tiết bệnh án' }).click();
  await page.getByLabel('Chuyên khoa', { exact: true }).fill('Khám tổng quát');
  await page.locator('.member-record-editor summary').filter({ hasText: 'Chỉ số xét nghiệm' }).click();
  await page.getByRole('button', { name: 'Thêm chỉ số xét nghiệm' }).click();
  await page.getByLabel('Tên xét nghiệm', { exact: true }).fill('Ví dụ');
  await page.getByLabel('Kết quả trên phiếu', { exact: true }).fill('Theo phiếu');
  for (const width of [320, 375, 393, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    const state = await page.locator('.member-record-editor').evaluate(form => {
      const bounds = form.getBoundingClientRect();
      const controls = [...form.querySelectorAll('input, select, textarea, button')].filter(e => e.getClientRects().length);
      return { count: controls.length, fits: controls.every(el => {
        const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && r.right <= innerWidth + 1 && r.height >= 44;
      }), overflow: form.scrollWidth > form.clientWidth + 1 };
    });
    result.viewports.push({ width, ...state });
    if (!state.fits || state.overflow || state.count < 15) result.failures.push(`layout_${width}`);
    if (width === 393) await page.locator('.member-record-editor').screenshot({ path: resolve(output, 'clinical-form-mobile.png') });
  }
  await page.getByLabel('Chuyên khoa', { exact: true }).focus(); await page.keyboard.press('Tab');
  if (!await page.getByLabel('Bác sĩ / người phụ trách', { exact: true }).evaluate(el => el === document.activeElement)) result.failures.push('keyboard_navigation');
  await page.getByRole('button', { name: 'Hủy thay đổi', exact: true }).click();
  if (await page.locator('.member-record-editor').count()) result.failures.push('cancel_editor');
  result.status = result.failures.length ? 'failed' : 'passed';
} catch (e) { result.status = 'failed'; result.error = e.message; }
finally {
  if (loggedIn) result.ownSessionRevoked = (await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303;
  await browser.close(); await writeFile(resolve(output, 'live.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result));
if (result.status !== 'passed' || !result.ownSessionRevoked) process.exitCode = 1;
