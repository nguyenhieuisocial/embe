// Read-only UI verification with synthetic appointment responses.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
if (!process.env.EMBE_VERIFY_PASSWORD) throw Error('password_missing');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
const page = await context.newPage(); let authenticated = false;
try {
  await page.route('**/api/pregnancy/records', route => route.fulfill({ json: { records: [{
    id: '11111111-1111-4111-8111-111111111111', kind: 'appointment', status: 'planned',
    occurredAt: '2099-09-10T02:30:00Z', title: 'Lịch khám mẫu', provider: 'Phòng khám mẫu với tên dài để kiểm tra hiển thị', clinician: 'Bác sĩ mẫu',
    notes: '', gestationalWeek: null, nextAppointmentAt: null, measurements: {}, medicines: [], documents: [],
  }] } }));
  await page.goto(`${origin}/me-bau/ho-so`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/me-bau/ho-so`, { timeout: 45000 }); authenticated = true;
  const card = page.locator('.next-appointment-compact'); await card.waitFor();
  for (const width of [375, 393, 430, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    for (const open of [false, true]) {
      await card.locator('details').evaluate((node, value) => node.open = value, open);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error(`overflow_${width}`);
    }
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await card.locator('details').evaluate(node => node.open = false);
  await card.scrollIntoViewIfNeeded();
  await mkdir('data/appointment-verification', { recursive: true });
  await card.screenshot({ path: 'data/appointment-verification/mobile.png' });
  const prepare = card.getByRole('button', { name: 'Chuẩn bị buổi khám' });
  await prepare.focus(); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Chuẩn bị buổi khám' }).waitFor();
  console.log('Passed: six viewport sizes, collapsed/expanded card, keyboard opens preparation. No clinical writes; not physical iOS.');
} finally {
  if (authenticated) await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 });
  await browser.close();
}
