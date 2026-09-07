// Live portal UI with synthetic notification transport in an isolated headless
// Cent profile. No push is sent and no real device preference is changed.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const expected = process.env.EMBE_VERIFY_VERSION; const password = process.env.EMBE_VERIFY_PASSWORD;
if (!expected || !password) throw new Error('missing_verification_config');
const health = await (await fetch(`${origin}/api/health?verify=${expected}&at=${Date.now()}`)).json();
if (health.version !== expected) { console.log(JSON.stringify({ pending: true, version: health.version })); process.exit(2); }
const output = resolve('data/notification-verification'); await mkdir(output, { recursive: true });
const result = { version: expected, transport: 'mocked; no actual push', syntheticOnly: true, widths: [] };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
let detailPreview = false; let failPreview = false; let loggedIn = false;
const eventId = randomUUID();
await context.route('**/api/notifications/**', async route => {
  const url = new URL(route.request().url()); const method = route.request().method();
  let data = {};
  if (url.pathname.endsWith('/activity') && method === 'GET') data = { activities: [{ id: eventId, kind: 'medical',
    title: 'Mẹ Ngân đã cập nhật phiếu siêu âm', body: 'Lần khám mẫu · 08:30 09/09/2026 · BV Mẫu', url: '/me-bau/ho-so', createdAt: new Date().toISOString() }] };
  else if (url.pathname.endsWith('/subscriptions') && method === 'GET') data = { roles: { mother: true, father: true }, enabledDevices: 2 };
  else if (url.pathname.endsWith('/preview')) {
    if (method === 'PATCH' && failPreview) return route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } });
    if (method === 'PATCH') detailPreview = route.request().postDataJSON().detailPreview;
    data = { detailPreview };
  } else return route.fulfill({ status: 403, json: { error: 'verification_blocks_push' } });
  return route.fulfill({ status: 200, json: data });
});
await context.addInitScript(() => {
  localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now()));
  const worker = new EventTarget(); const registration = { pushManager: { getSubscription: async () => ({ endpoint: 'https://notification-fixture.example.invalid/browser' }) },
    active: { postMessage() {} }, update: async () => {} };
  Object.assign(worker, { ready: Promise.resolve(registration), register: async () => registration, controller: registration.active });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
});
const page = await context.newPage();
try {
  await page.goto(`${origin}/cai-dat`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/cai-dat`, { timeout: 45000 }); loggedIn = true;
  const toggle = page.getByRole('switch', { name: /Chi tiết trên màn hình khóa/ });
  await toggle.waitFor();
  await page.getByRole('switch', { name: /màn hình khóa · Tắt/ }).waitFor();
  const banner = page.locator('.app-update-banner');
  await banner.getByText('Lần khám mẫu · 08:30 09/09/2026 · BV Mẫu').waitFor();
  for (const width of [375, 393, 430, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
      badTargets: [...document.querySelectorAll('.notification-setup button,.notification-setup input,.app-update-banner a,.app-update-banner button')]
        .filter(el => el.getBoundingClientRect().width && (el.getBoundingClientRect().width < 43 || el.getBoundingClientRect().height < 43)).length }));
    result.widths.push({ width, ...metrics }); if (metrics.overflow || metrics.badTargets) throw new Error(`layout_${width}`);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await banner.screenshot({ path: resolve(output, 'notification-banner.png') });
  await banner.getByRole('button', { name: 'Ẩn thông báo này' }).focus(); await page.keyboard.press('Enter');
  await banner.waitFor({ state: 'hidden' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(id => localStorage.getItem('embe:dismissed-activity') === id, eventId);
  result.dismissed = true;
  await toggle.focus(); await page.keyboard.press('Enter');
  await page.getByRole('switch', { name: /màn hình khóa · Bật/ }).waitFor();
  failPreview = true; await toggle.click();
  await page.getByText('Chưa xác nhận được cài đặt. Kiểm tra mạng rồi thử lại.').waitFor();
  if (await toggle.getAttribute('aria-checked') !== 'true') throw new Error('optimistic_privacy_failure');
  failPreview = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('switch', { name: /màn hình khóa · Bật/ }).waitFor();
  if (await page.locator('.app-update-banner').count()) throw new Error('dismissed_event_returned');
  await page.locator('.notification-setup').screenshot({ path: resolve(output, 'notification-settings.png') });
  result.previewPersisted = true; result.failedSavePreserved = true; result.keyboardPassed = true;
  // Probe real API authorization/schema without enqueueing anything or reading a family record.
  const read = await context.request.post(`${origin}/api/notifications/preview`, { headers: { origin }, data: { endpoint: 'https://notification-fixture.example.invalid/nonexistent' } });
  if (read.status() !== 404) throw new Error(`real_preview_api_${read.status()}`);
  const ignored = await context.request.post(`${origin}/api/notifications/activity`, { headers: { origin }, data: {
    eventId: randomUUID(), sourceDeviceId: randomUUID(), pathname: '/api/auth/login', method: 'POST' } });
  if (ignored.status() !== 204) throw new Error(`real_activity_api_${ignored.status()}`);
  result.realApiContracts = true; result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error instanceof Error ? error.message : 'verification_failed'; }
finally {
  if (loggedIn) result.ownSessionRevoked = (await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303;
  await browser.close(); await writeFile(resolve(output, 'notification-live-result.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result)); if (result.status !== 'passed') process.exitCode = 1;
