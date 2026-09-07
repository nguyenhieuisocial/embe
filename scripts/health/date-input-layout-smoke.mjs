// CSS/layout-only fixtures: no health data, uploads or background services.
// --live loads the deployed CSS behind an isolated, short-lived login.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const live = process.argv.includes('--live');
const origin = 'https://embe.hieu.asia';
const output = resolve('data/date-input-verification');
await mkdir(output, { recursive: true });
const values = { date: '2026-12-28', 'datetime-local': '2026-12-28T18:45', time: '18:45', month: '2026-12', week: '2026-W52' };
const field = (text, type = 'date', empty = false) => `<label>${text}<input type="${type}" value="${empty ? '' : values[type]}" aria-label="${text}"></label>`;
const fixtures = [
  ['pregnancy', `<form class="pregnancy-profile-form"><div class="pregnancy-profile-grid">${field('Ngày dự sinh')}${field('Ngày đầu kỳ kinh cuối', 'date', true)}</div></form>`],
  ['family', `<section class="family-profile"><form><label><span><strong>Mẹ Ngân</strong><small>Ngày sinh của Mẹ</small></span><input type="date" value="1995-12-28" aria-label="Ngày sinh của Mẹ"></label></form></section>`],
  ['medical', `<form class="medical-form"><div class="medical-form-grid"><label>Tiêu đề<input value="Khám thai" aria-label="Tiêu đề"></label>${field('Ngày và giờ khám', 'datetime-local')}${field('Lịch hẹn tiếp theo', 'datetime-local', true)}</div></form>`],
  ['planner', `<form class="planner-form"><div class="planner-form-row">${field('Ngày kế hoạch')}${field('Giờ kế hoạch', 'time')}</div></form>`],
  ['budget', `<form class="budget-form"><div><label>Loại<select><option>Đã chi</option></select></label>${field('Ngày chi')}</div></form>`],
  ['members', `<form class="member-form"><fieldset><div class="member-fields">${field('Ngày sinh thành viên')}${field('Thời điểm ghi nhận', 'datetime-local')}</div></fieldset></form>`],
  ['birth', `<form class="birth-form"><fieldset>${field('Ngày và giờ sinh', 'datetime-local')}${field('Giờ xuất viện', 'datetime-local', true)}</fieldset></form>`],
  ['studio', `<form class="discovery-snapshot"><label class="studio-search">Giờ ghi nhận<input type="datetime-local" value="2026-12-28T18:45" aria-label="Giờ ghi nhận"></label></form>`],
  ['reminder', `<section class="notification-setup"><label class="notification-time"><span>Giờ nhắc hằng ngày</span><input type="time" value="18:45" aria-label="Giờ nhắc hằng ngày"></label></section>`],
  ['fallback', `<form class="member-form">${field('Tháng', 'month')}${field('Tuần', 'week')}${field('Giờ trống', 'time', true)}</form>`]
];
const temporal = 'input:is([type="date"],[type="datetime-local"],[type="month"],[type="week"],[type="time"])';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'vi-VN', serviceWorkers: 'block' });
const page = await context.newPage(); let loggedIn = false;
const result = { mode: live ? 'live' : 'local-css', cases: [], failures: [], actualForms: [] };
try {
  let styles = '', fontBody = 'Arial, sans-serif', fontDisplay = 'Georgia, serif';
  if (live) {
    const expected = process.env.EMBE_VERIFY_VERSION, password = process.env.EMBE_VERIFY_PASSWORD;
    if (!expected || !password) throw new Error('missing_verification_config');
    const health = await (await fetch(`${origin}/api/health?verify=${expected}&at=${Date.now()}`)).json();
    if (health.version !== expected) throw new Error('deployment_pending');
    result.version = expected;
    await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
    await context.route('**/api/notifications/activity**', route => route.fulfill({ json: { activities: [] } }));
    await context.route('**/api/pregnancy/records', route => route.fulfill({ json: { records: [], insights: [] } }));
    // Deny all app writes except this isolated test login and its logout.
    await context.route('**/api/**', async route => {
      const request = route.request();
      if (!['GET', 'HEAD'].includes(request.method()) && !['/api/auth/login', '/api/auth/logout'].includes(new URL(request.url()).pathname)) {
        result.failures.push('unexpected_write_blocked'); return route.abort();
      }
      return route.fallback();
    });
    await page.goto(`${origin}/huong-dan`);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
    await page.waitForURL(`${origin}/huong-dan`, { timeout: 45000 }); loggedIn = true;
    [fontBody, fontDisplay] = await page.evaluate(() => [getComputedStyle(document.body).getPropertyValue('--font-body'), getComputedStyle(document.body).getPropertyValue('--font-display')]);
    const urls = new Set();
    for (const route of ['/me-bau/ho-so', '/nha-minh/ho-so', '/studio/kham-pha']) {
      await page.goto(`${origin}${route}`, { waitUntil: 'load' });
      for (const url of await page.locator('link[rel="stylesheet"]').evaluateAll(els => els.map(el => el.href))) urls.add(url);
      // Only open disclosures and the empty add-record form; never save data.
      if (route === '/me-bau/ho-so') {
        await page.locator('.pregnancy-profile-settings > summary').click();
        await page.locator('.medical-records > .medical-add, .medical-records .medical-add').first().click();
        await page.locator('#medical-record-form').waitFor();
      }
      for (const width of [375, 393, 430]) {
        await page.setViewportSize({ width, height: 852 });
        const actual = await page.locator(temporal).evaluateAll(els => els.filter(el => el.getClientRects().length).map(el => {
          const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
          return { type: el.type, width: r.width, fits: r.left >= p.left - 1 && r.right <= p.right + 1 && r.right <= innerWidth + 1, height: r.height };
        }));
        result.actualForms.push({ route, width, count: actual.length, fits: actual.every(x => x.fits && x.height >= 44) });
        if (actual.some(x => !x.fits || x.height < 44)) result.failures.push(`actual_${route}_${width}`);
      }
    }
    for (const url of urls) styles += await (await context.request.get(url)).text();
  } else {
    for (const file of ['src/app/globals.css', 'src/app/nha-minh/ho-so/profiles.css', 'src/app/studio/studio.css']) {
      styles += await readFile(resolve('apps/portal', file), 'utf8');
    }
  }
  await page.setContent(`<html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><style>
    :root{--font-body:${fontBody};--font-display:${fontDisplay}} body{margin:0} .layout-fixture{margin:16px;padding:14px;border:1px solid #ead9e1;border-radius:16px;max-width:600px} .layout-fixture h2{font-size:16px;margin:0 0 12px}
  </style></head><body>${fixtures.map(([name, html]) => `<section class="layout-fixture" data-case="${name}"><h2>${name}</h2>${html}</section>`).join('')}</body></html>`);
  for (const width of [320, 375, 393, 430, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    for (const scale of [1, 1.25]) {
      await page.evaluate(scale => document.documentElement.style.fontSize = `${scale * 16}px`, scale);
      const cases = await page.locator('.layout-fixture').evaluateAll(sections => sections.map(section => {
        const parent = section.getBoundingClientRect();
        return { name: section.dataset.case, fits: [...section.querySelectorAll('input')].every(el => {
          const r = el.getBoundingClientRect(), label = el.parentElement.getBoundingClientRect();
          return r.right <= parent.right - 12 && r.right <= label.right + 1 && r.left >= label.left - 1 && r.height >= 44;
        }), overflow: section.scrollWidth > section.clientWidth + 1 };
      }));
      result.cases.push({ width, scale, cases });
      for (const c of cases) if (!c.fits || c.overflow) result.failures.push(`${width}_${scale}_${c.name}`);
      if (width === 393 && scale === 1) await page.screenshot({ path: resolve(output, `${result.mode}.png`), fullPage: true });
    }
  }
  // Native values and keyboard entry remain usable: do not turn dates into text.
  await page.getByLabel('Ngày dự sinh', { exact: true }).fill('2027-02-03');
  await page.getByLabel('Ngày và giờ khám', { exact: true }).fill('2027-02-03T09:30');
  await page.getByLabel('Ngày dự sinh', { exact: true }).focus(); await page.keyboard.press('Tab');
  const valuesKept = await page.getByLabel('Ngày dự sinh', { exact: true }).inputValue() === '2027-02-03'
    && await page.getByLabel('Ngày và giờ khám', { exact: true }).inputValue() === '2027-02-03T09:30';
  if (!valuesKept) result.failures.push('date_values');
  result.status = result.failures.length ? 'failed' : 'passed';
} catch (error) { result.status = 'failed'; result.error = error.message; }
finally {
  if (loggedIn) result.ownSessionRevoked = (await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303;
  await browser.close(); await writeFile(resolve(output, `${result.mode}.json`), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ ...result, cases: result.cases.length }));
if (result.status !== 'passed') process.exitCode = 1;
