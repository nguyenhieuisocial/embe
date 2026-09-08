// Read-only live layout proof in an isolated Cent context. No server starts,
// browser profiles, real record edits, social posts, or raw private data output.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const baseline = process.argv.includes('--baseline');
const output = resolve('data/interface-verification');
const version = process.env.EMBE_VERIFY_VERSION;
const password = process.env.EMBE_VERIFY_PASSWORD;
const routes = ['/', '/me-bau', '/nha-minh', '/ky-niem', '/me-bau/bua-an', '/me-bau/ho-so', '/me-bau/suc-khoe-iphone', '/ke-hoach', '/nhat-ky', '/cai-dat', '/studio', '/studio/nghien-cuu'];
const viewports = [[375, 667], [393, 852], [430, 932], [412, 915], [768, 1024], [1280, 900]];
const hubs = new Map([['/', 'home'], ['/me-bau', 'mother'], ['/nha-minh', 'family'], ['/ky-niem', 'memories']]);
const selectors = {
  '/': '.daily-shortcuts a',
  '/me-bau': '.maternal-shortcuts a',
  '/nha-minh': '.family-essentials a, .tool-group > summary',
};
const result = {
  mode: baseline ? 'baseline' : 'upgraded', version,
  browser: 'isolated headless Cent; not Safari/WebKit or a physical iPhone',
  status: 'running', cases: [], failures: [], screenshots: [],
  blockedApiWriteAttempts: 0, apiWritesDeliveredOtherThanOwnAuth: 0,
  search: null, quickActions: null, ownSessionRevoked: false,
};
let phase = 'configuration';

function fail(code) {
  result.failures.push(code);
}

async function settleLayout(page) {
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

async function ready(page) {
  await page.locator('.family-nav').waitFor({ state: 'visible' });
  // Server HTML may appear before client-side navigation ownership settles.
  await page.waitForFunction(() => document.querySelectorAll('.family-nav a[aria-current="page"]').length === 1);
  await settleLayout(page);
}

async function layoutAt(page, path, width, height) {
  await page.setViewportSize({ width, height });
  await settleLayout(page);
  const selector = baseline || path === '/ky-niem' ? '' : selectors[path] ?? '.context-back';
  const measurement = await page.evaluate(targetSelector => {
    const visible = node => {
      const r = node.getBoundingClientRect(), style = getComputedStyle(node);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const nav = document.querySelector('.family-nav');
    const links = nav ? [...nav.querySelectorAll('a')].filter(visible) : [];
    const targets = targetSelector ? [...document.querySelectorAll(targetSelector)].filter(visible) : [];
    const small = targets.filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width < 43.5 || rect.height < 43.5;
    });
    return {
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
      navVisible: Boolean(nav && visible(nav)),
      navLinks: links.length,
      activeNav: links.filter(node => node.getAttribute('aria-current') === 'page').length,
      touchTargets: targets.length,
      smallTouchTargets: small.length,
    };
  }, selector);
  result.cases.push({ route: path, width, height, ...measurement });
  if (measurement.overflow) fail(`overflow:${path}:${width}`);
  if (!measurement.navVisible || measurement.navLinks !== 4 || measurement.activeNav !== 1) fail(`navigation:${path}:${width}`);
  if (selector && (!measurement.touchTargets || measurement.smallTouchTargets)) fail(`touch_targets:${path}:${width}`);
}

async function captureHub(page, path) {
  const name = hubs.get(path);
  if (!name) return;
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await settleLayout(page);
  const filename = `${result.mode}-${name}-393.png`;
  // Capture the viewport only. Hide photos, journal/appointment text and
  // pregnancy values if they happen to enter this viewport while data loads.
  const mask = page.locator([
    'main img', 'main video', 'main canvas', '.today-priority-list', '.thread',
    '.week-card', '.pregnancy-chapter .panel-kicker', '.care-summary', '.checklist',
    '.memory-album-copy', '.memory-trip-copy', '.memory-day-copy', '.timeline-caption',
  ].join(', '));
  await page.screenshot({ path: resolve(output, filename), fullPage: false, mask: [mask], maskColor: '#e8dbe3', animations: 'disabled' });
  result.screenshots.push(filename);
}

async function verifySearch(page) {
  phase = 'tool_search';
  const search = page.getByRole('searchbox', { name: /^Tìm công cụ/ });
  await search.waitFor({ state: 'visible' });
  const before = await page.locator('.tool-group').count();
  const medication = page.locator('.tool-directory a[href="/me-bau/suc-khoe-iphone#vi-chat-thuoc"]');
  await search.fill('thuốc');
  await medication.waitFor({ state: 'visible' });
  const accented = await page.locator('.tool-group a').count();
  await search.fill('thuoc');
  await medication.waitFor({ state: 'visible' });
  const unaccented = await page.locator('.tool-group a').count();
  await search.fill('zzzzembe-no-matching-tool');
  await page.waitForFunction(() => document.querySelectorAll('.tool-group').length === 0);
  const noMatches = await page.locator('.tool-search-count').evaluate(node => node.textContent?.includes('Chưa tìm thấy') === true);
  await page.getByRole('button', { name: 'Xóa tìm kiếm công cụ', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.tool-group').length === count, before);
  const cleared = await search.inputValue() === '';
  await search.evaluate(node => node.blur());
  result.search = { accentedResults: accented, unaccentedResults: unaccented, noMatches, cleared, restoredGroups: before };
  if (!accented || accented !== unaccented || !noMatches || !cleared) fail('tool_search');
}

async function verifyQuickActions(page) {
  phase = 'quick_actions';
  await page.setViewportSize({ width: 393, height: 852 });
  const trigger = page.locator('.quick-trigger');
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: 'Ghi nhanh', exact: true });
  await sheet.waitFor({ state: 'visible' });
  const controls = sheet.locator('a[href], button:not([disabled])');
  const count = await controls.count();
  const initialFocusInside = await sheet.evaluate(node => node.contains(document.activeElement));
  await controls.last().focus();
  await page.keyboard.press('Tab');
  const forwardTrap = await controls.first().evaluate(node => node === document.activeElement);
  await page.keyboard.press('Shift+Tab');
  const backwardTrap = await controls.last().evaluate(node => node === document.activeElement);
  const smallTouchTargets = await controls.evaluateAll(nodes => nodes.filter(node => {
    const r = node.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5;
  }).length);
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'hidden' });
  const focusRestored = await trigger.evaluate(node => node === document.activeElement);
  result.quickActions = { controls: count, initialFocusInside, forwardTrap, backwardTrap, smallTouchTargets, focusRestored };
  if (!count || !initialFocusInside || !forwardTrap || !backwardTrap || smallTouchTargets || !focusRestored) fail('quick_actions');
}

async function run() {
  await mkdir(output, { recursive: true });
  if (!password || !version) throw new Error('missing_verification_config');
  phase = 'health';
  // One health request and one login for the run: no retry loops or auth hammering.
  const healthResponse = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(20000) });
  if (!healthResponse.ok) throw new Error('health_unavailable');
  const health = await healthResponse.json();
  if (health.version !== version) {
    result.status = 'deployment_pending';
    process.exitCode = 2;
    return;
  }
  phase = 'launch';
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
  let context;
  let loginAttempted = false;
  try {
    context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'vi-VN', serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const ownAuth = url.origin === origin && ['/api/auth/login', '/api/auth/logout'].includes(url.pathname);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !ownAuth) {
        result.blockedApiWriteAttempts++;
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    phase = 'login';
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    loginAttempted = true;
    await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
    await page.waitForURL(url => url.origin === origin && url.pathname === '/', { timeout: 45000 });
    await ready(page);

    for (const path of routes) {
      phase = `page:${path}`;
      if (path !== '/') {
        const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (!response?.ok() || new URL(page.url()).pathname !== path) throw new Error('route_unavailable');
      }
      await ready(page);
      if (!baseline) {
        if (path === '/') {
          await page.locator('.daily-shortcuts').waitFor({ state: 'visible' });
          await page.locator('.timeline-panel').waitFor({ state: 'visible' });
          await page.locator('.timeline-panel[aria-busy="true"]').waitFor({ state: 'hidden' });
          result.homeJournalPreviewCount = await page.locator('.timeline-panel .thread-item').count();
          if (result.homeJournalPreviewCount > 3) fail('home_preview_too_long');
        }
        if (path === '/me-bau') await page.locator('.maternal-shortcuts').waitFor({ state: 'visible' });
        if (path === '/nha-minh') {
          await page.locator('.family-essentials').waitFor({ state: 'visible' });
          await verifySearch(page);
        }
        if (path.startsWith('/studio') && await page.locator('.quick-trigger').count()) fail(`studio_family_quick_action:${path}`);
        if (path === '/me-bau/suc-khoe-iphone') {
          await page.getByRole('button', { name: 'Thuốc & vi chất', exact: true }).click();
          await page.locator('#vi-chat-thuoc').waitFor({ state: 'visible' });
          if (await page.locator('#suc-khoe-iphone').isVisible()) fail('iphone_panel_not_hidden');
          await page.getByRole('button', { name: 'Sức khỏe iPhone', exact: true }).click();
          await page.locator('#suc-khoe-iphone').waitFor({ state: 'visible' });
          if (await page.locator('#vi-chat-thuoc').isVisible()) fail('medication_panel_not_hidden');
          result.carePanels = true;
        }
        if (!hubs.has(path)) await page.locator('.context-back').waitFor({ state: 'visible' });
      }
      for (const [width, height] of viewports) await layoutAt(page, path, width, height);
      await captureHub(page, path);
      if (path === '/') await verifyQuickActions(page);
    }
    result.status = result.failures.length ? 'failed' : 'passed';
    if (result.status === 'failed') process.exitCode = 1;
  } finally {
    if (loginAttempted && context) {
      // APIRequestContext is used only for our own session revocation, never
      // for family mutations (browser routing does not intercept this client).
      try {
        const response = await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0, timeout: 20000 });
        result.ownSessionRevoked = response.status() === 303;
        if (!result.ownSessionRevoked) fail('own_session_not_revoked');
      } catch { fail('own_session_revocation_unconfirmed'); }
    }
    await browser.close();
  }
}

try {
  await run();
} catch (error) {
  result.status = 'failed';
  result.error = /^[a-z_]+$/.test(error.message ?? '') ? error.message : 'verification_failed';
  result.phase = phase;
  process.exitCode = 1;
} finally {
  if (result.failures.length && result.status === 'passed') { result.status = 'failed'; process.exitCode = 1; }
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, `${result.mode}.json`), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({
  mode: result.mode, version: result.version, status: result.status, browser: result.browser,
  cases: result.cases.length, failures: result.failures, screenshots: result.screenshots,
  blockedApiWriteAttempts: result.blockedApiWriteAttempts, apiWritesDeliveredOtherThanOwnAuth: result.apiWritesDeliveredOtherThanOwnAuth,
  search: result.search, quickActions: result.quickActions, ownSessionRevoked: result.ownSessionRevoked,
  error: result.error, phase: result.phase,
}));
