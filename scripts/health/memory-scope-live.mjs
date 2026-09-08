// Read-only: verifies server photo scope after leaving an album.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
if (!process.env.EMBE_VERIFY_PASSWORD) throw new Error('missing_password');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
const page = await context.newPage();
let logged = false;
try {
  await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
  await page.goto(origin + '/ky-niem?view=album');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/ky-niem', { timeout: 45000 });
  logged = true;
  const album = page.locator('.memory-album').first();
  await album.waitFor({ timeout: 45000 });
  const href = await album.getAttribute('href');
  for (const name of ['Ngày tháng', 'Chuyến đi', 'Bản đồ']) {
    await page.goto(origin + href);
    const navigation = page.getByRole('navigation', { name: 'Cách xem kỷ niệm' });
    const link = navigation.getByRole('link', { name, exact: true });
    await link.waitFor({ timeout: 45000 });
    if (new URL(await link.getAttribute('href'), origin).searchParams.has('album')) throw new Error('stale_album_link');
    await link.click();
    // A button means the new unscoped server payload replaced the old album component.
    await navigation.getByRole('button', { name, exact: true }).waitFor({ timeout: 45000 });
    if (new URL(page.url()).searchParams.has('album')) throw new Error('stale_album_url');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('horizontal_overflow');
  }
  console.log(JSON.stringify({ albumScopeReset: true, views: 3, viewport: '393x852', browser: 'Cent; not physical iPhone', dataWrites: false }));
} finally {
  if (logged) await context.request.post(origin + '/api/auth/logout', { headers: { origin }, maxRedirects: 0 }).catch(() => {});
  await browser.close();
}
