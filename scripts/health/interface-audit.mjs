import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.EMBE_AUDIT_ORIGIN || 'https://embe.hieu.asia';
const routes = ['/', '/me-bau', '/me-bau/ho-so', '/me-bau/suc-khoe-iphone#vi-chat-thuoc', '/me-bau/bua-an', '/ghi-lai', '/ky-niem', '/nhat-ky', '/lich', '/ke-hoach', '/do-dung', '/nha-minh', '/cai-dat', '/tro-ly', '/studio', '/studio/nghien-cuu', '/studio/kham-pha', '/me-bau/suc-khoe', '/me-bau/trieu-chung', '/me-bau/tam-trang', '/me-bau/tuan-nay', '/chuan-bi-sinh', '/be', '/ngan-sach', '/tim-kiem'];
const selected = process.env.EMBE_AUDIT_ROUTES?.split(',') || routes;
const output = process.env.EMBE_AUDIT_OUTPUT || 'data/interface-audit';
const previewCss = process.env.EMBE_AUDIT_CSS ? await readFile(process.env.EMBE_AUDIT_CSS, 'utf8') : null;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
await context.addInitScript(() => { localStorage.setItem('embe:device-role', 'mother'); localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())); });
const page = await context.newPage();
let logged = false;
const results = []; let errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(origin + '/me-bau');
  if (page.url().includes('/login')) {
    await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.EMBE_VERIFY_PASSWORD);
    await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
    await page.waitForURL(origin + '/me-bau', { timeout: 45000 });
    logged = true;
  }
  for (const route of selected) {
    for (const width of (process.env.EMBE_AUDIT_WIDTHS || '393,1280').split(',').map(Number)) {
      errors = [];
      await page.setViewportSize({ width, height: 852 });
      const start = Date.now();
      const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
      if (!response?.ok() || page.url().includes('/login')) throw new Error(`Page unavailable: ${route} HTTP ${response?.status()}`);
      await page.waitForTimeout(1200);
      if (!await page.locator('h1').count()) throw new Error(`Missing page heading: ${route}`);
      if (previewCss) await page.addStyleTag({ content: previewCss });
      const scan = await page.evaluate(() => {
        const visible = el => {
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden],.sr-only,[aria-hidden="true"]')) return false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (p.matches('details:not([open])') && !p.querySelector(':scope > summary')?.contains(el)) return false;
          }
          return true;
        };
        const target = el => el.matches('input[type="checkbox"],input[type="radio"],input[type="file"]') && el.labels?.length ? el.labels[0] : el;
        const controls = [...document.querySelectorAll('button, summary, input:not([type=hidden]), select, textarea')].filter(visible);
        return {
          title: document.querySelector('h1')?.textContent?.trim(),
          headings: [...document.querySelectorAll('h1, h2')].filter(visible).map(el => el.textContent.trim()).slice(0, 18),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          height: document.documentElement.scrollHeight,
          controls: controls.length,
          smallControls: controls.filter(el => { const b = target(el).getBoundingClientRect(); return b.width < 43 || b.height < 43; }).map(el => ({ tag: el.tagName, cls: el.className, text: el.getAttribute('aria-label') || (el.tagName === 'INPUT' ? el.type : el.textContent.trim().slice(0, 45)), height: Math.round(target(el).getBoundingClientRect().height), width: Math.round(target(el).getBoundingClientRect().width) })).slice(0, 20),
          openDetails: [...document.querySelectorAll('details[open]')].filter(visible).length,
          overlapping: [...document.querySelectorAll('main input, main select, main textarea')].filter(visible).filter(el => el.getBoundingClientRect().right > innerWidth + 1).length,
        };
      });
      const name = (route.replace(/[^a-z0-9]/gi, '-') || 'home') + '-' + width;
      await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
      results.push({ route, width, previewCss: Boolean(previewCss), elapsed: Date.now() - start, ...scan, errors: [...errors] });
      console.log(JSON.stringify({ route, width, overflow: scan.overflow, small: scan.smallControls.length, errors: errors.length }));
      await writeFile(`${output}/audit.json`, JSON.stringify(results, null, 2));
    }
  }
} finally {
  if (logged) await context.request.post(origin + '/api/auth/logout', { headers: { origin }, maxRedirects: 0 }).catch(() => {});
  await browser.close();
}
