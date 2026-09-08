import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
if (!process.env.EMBE_VERIFY_PASSWORD) throw new Error('missing_password');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
const page = await context.newPage(); let logged = false;
try {
  await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
  await page.goto(origin + '/me-bau');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(origin + '/me-bau', { timeout: 45000 }); logged = true;
  const results = [];
  for (let run = 0; run < 3; run++) {
    if (run) await page.goto(origin + '/me-bau');
    const shortcut = page.locator('.maternal-shortcuts a').first();
    await shortcut.waitFor();
    await shortcut.scrollIntoViewIfNeeded();
    // Fixed idle time represents reading the dashboard, identical before/after.
    await page.waitForTimeout(3000);
    const start = performance.now();
    await shortcut.click();
    await page.getByText('Mẹ vừa ăn gì?', { exact: true }).waitFor({ timeout: 45000 });
    results.push(Math.round(performance.now() - start));
  }
  console.log(JSON.stringify({ route: 'me-bau -> bua-an', clickToFormMs: results, medianMs: [...results].sort((a,b)=>a-b)[1], browser: 'Cent, 393x852; not physical iPhone', writes: false }));
} finally {
  if (logged) await context.request.post(origin + '/api/auth/logout', { headers: { origin }, maxRedirects: 0 }).catch(() => {});
  await browser.close();
}
