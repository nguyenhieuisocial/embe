// Separate Cent sessions, own synthetic task only; no push to family phones.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const version = process.env.EMBE_VERIFY_VERSION, password = process.env.EMBE_VERIFY_PASSWORD;
if (!version || !password) throw new Error('missing_verification_config');
const health = await (await fetch(`${origin}/api/health?verify=${version}`, { cache: 'no-store' })).json();
if (health.version !== version) { console.log(JSON.stringify({ pending: true, version: health.version })); process.exit(2); }
const output = resolve('data/family-sync-verification'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const contexts = [], loggedIn = [];
const result = { version, syntheticOnly: true, browser: 'isolated Cent', widths: [] };
let writer, taskId;
const day = '2099-12-29'; // no real appointments or due-today notifications
const suffix = randomUUID().slice(0, 8), title = `EMBE SYNC VERIFICATION ${suffix}`;
const json = (context, method, data) => context.request.fetch(`${origin}/api/tasks`, { method, headers: { origin, 'content-type': 'application/json' }, data });
try {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    contexts.push(context);
    await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
    const page = await context.newPage();
    await page.goto(`${origin}/ke-hoach?date=${day}`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
    await page.waitForURL(`${origin}/ke-hoach?date=${day}`, { timeout: 45000 });
    loggedIn.push(context);
    await page.getByRole('button', { name: 'Thêm việc mới' }).waitFor();
  }
  writer = contexts[1]; const reader = contexts[0].pages()[0]; await reader.bringToFront();
  await reader.waitForFunction(() => !document.querySelector('.planner-skeleton'));
  await reader.evaluate(() => { window.__embeSyncVerification = 'same-document'; });
  let navigationCount = 0; reader.on('framenavigated', frame => { if (frame === reader.mainFrame()) navigationCount++; });
  const started = Date.now();
  const task = { title, note: 'Synthetic sync verification only', ownerRole: 'family', category: 'general', linkTarget: 'none', dueOn: day, dueTime: null, repeatRule: 'none' };
  const created = await json(writer, 'POST', { ...task, idempotencyKey: randomUUID() });
  if (created.status() !== 201) throw new Error(`create_${created.status()}`);
  taskId = (await created.json()).id; result.taskId = taskId;
  // No reload, focus events, synthetic messages or service worker: real foreground fallback.
  await reader.getByText(title, { exact: true }).waitFor({ timeout: 75000 });
  result.remoteCreateSeconds = (Date.now() - started) / 1000;
  if (await reader.evaluate(() => window.__embeSyncVerification) !== 'same-document') throw new Error('unexpected_hard_reload');
  const update = await json(writer, 'PATCH', { ...task, action: 'update', id: taskId, title: `${title} UPDATED` });
  if (update.status() !== 200) throw new Error(`update_${update.status()}`);
  await reader.getByRole('button', { name: 'Thêm việc mới' }).click();
  await reader.getByLabel('Việc cần làm').fill('Nội dung chưa lưu phải được giữ');
  let listReads = 0; const observedRead = response => { if (response.url().includes('/api/tasks?')) listReads++; };
  reader.on('response', observedRead);
  // While the draft is open, automatic signals must defer rather than overwrite.
  await reader.waitForTimeout(62000);
  if (await reader.getByLabel('Việc cần làm').inputValue() !== 'Nội dung chưa lưu phải được giữ') throw new Error('draft_overwritten');
  if (listReads !== 0) throw new Error('draft_not_deferred');
  reader.off('response', observedRead); result.draftPreserved = true;
  await reader.getByRole('button', { name: 'Đóng', exact: true }).focus(); await reader.keyboard.press('Enter');
  await reader.getByText(`${title} UPDATED`, { exact: true }).waitFor({ timeout: 15000 });
  result.catchUpAfterEditing = true;
  await contexts[0].setOffline(true);
  const removed = await json(writer, 'DELETE', { id: taskId });
  if (removed.status() !== 200) throw new Error(`delete_${removed.status()}`);
  result.deletedOwnTask = true;
  await contexts[0].setOffline(false);
  await reader.getByText(`${title} UPDATED`, { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
  result.remoteDeleteAfterReconnect = true;
  for (const width of [375, 393, 430, 412, 768, 1280]) {
    await reader.setViewportSize({ width, height: 852 });
    const overflow = await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    result.widths.push({ width, overflow }); if (overflow) throw new Error(`layout_${width}`);
  }
  result.noHardReload = await reader.evaluate(() => window.__embeSyncVerification === 'same-document');
  result.mainFrameNavigations = navigationCount; result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = String(error.message).split('\n')[0]; process.exitCode = 1; }
finally {
  if (taskId && !result.deletedOwnTask) {
    try { result.deletedOwnTask = (await json(writer, 'DELETE', { id: taskId })).status() === 200; } catch { result.deletedOwnTask = false; }
  }
  result.sessionsRevoked = [];
  for (const context of loggedIn) {
    try { result.sessionsRevoked.push((await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303); } catch { result.sessionsRevoked.push(false); }
  }
  if (taskId && !result.deletedOwnTask || result.sessionsRevoked.some(ok => !ok)) { result.status = 'cleanup_needed'; process.exitCode = 1; }
  await writeFile(resolve(output, 'live-result.json'), JSON.stringify(result, null, 2)); await browser.close();
}
console.log(JSON.stringify(result));
