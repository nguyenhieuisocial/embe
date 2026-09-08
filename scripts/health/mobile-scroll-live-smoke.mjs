// Read-only app verification in an isolated browser. No clinical data is saved or logged.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const candidate = process.argv.includes('--candidate');
const result = { candidate, readOnly: true, browser: 'Cent; mobile viewport, not physical iOS', checks: [] };
if (!process.env.EMBE_VERIFY_PASSWORD) throw new Error('verification_password_missing');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
const page = await context.newPage(); let loggedIn = false;
page.setDefaultTimeout(15000);
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function aligned(label) {
  await settle();
  const geometry = await page.evaluate(() => {
    const nav = document.querySelector('.family-nav').getBoundingClientRect();
    const quick = document.querySelector('.quick-trigger').getBoundingClientRect();
    return { navBottom: nav.bottom, navTop: nav.top, quickTop: quick.top, quickBottom: quick.bottom, height: innerHeight, width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  if (geometry.width < 768 && (Math.abs(geometry.navBottom - geometry.height) > 2 || geometry.quickBottom > geometry.height + 2 || geometry.quickTop < geometry.navTop - 35)) throw new Error(`misaligned_${label}_${JSON.stringify(geometry)}`);
  if (geometry.scrollWidth > geometry.width + 1) throw new Error(`horizontal_overflow_${label}`);
  result.checks.push(label);
}
try {
  result.version = (await (await fetch(`${origin}/api/health`)).json()).version;
  if (process.env.EMBE_VERIFY_VERSION && result.version !== process.env.EMBE_VERIFY_VERSION) throw new Error('version_not_live');
  await page.goto(`${origin}/me-bau/ho-so`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.EMBE_VERIFY_PASSWORD);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/me-bau/ho-so`, { timeout: 45000 }); loggedIn = true;
  await page.locator('.medical-records article').first().waitFor();
  if (candidate) {
    const portalRequire = createRequire(new URL('../../apps/portal/package.json', import.meta.url));
    const esbuild = portalRequire('esbuild');
    const source = await readFile('apps/portal/src/lib/mobile-dock-position.ts', 'utf8');
    const { code } = await esbuild.transform(source, { loader: 'ts', format: 'iife', globalName: 'EmbeDockCandidate', target: 'es2022' });
    await page.addScriptTag({ content: `${code}\nwindow.__candidateDockStop=EmbeDockCandidate.observeMobileDock(document.querySelector('.app-shell'));` });
    await page.addStyleTag({ content: '@media screen and (max-width:767px){.has-nav :is(.family-nav,.quick-trigger){translate:0 var(--embe-dock-offset,0px)}}' });
  }
  for (const width of [375, 393, 430, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    for (const y of [0, 450, 950, 1400, 800, 250, 0]) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y); await aligned(`scroll_${width}_${y}`);
    }
  }
  await page.setViewportSize({ width: 393, height: 852 });
  // Deliberately reproduce the GEOMETRY of a stale fixed-bottom origin, not an iOS engine.
  await page.evaluate(() => {
    const nav = document.querySelector('.family-nav'); const quick = document.querySelector('.quick-trigger');
    nav.style.bottom = '280px'; quick.style.bottom = `${parseFloat(getComputedStyle(quick).bottom) + 280}px`;
    window.dispatchEvent(new Event('scroll'));
  });
  await aligned('injected_floating_origin_repaired');
  await page.evaluate(() => { document.querySelector('.family-nav').style.removeProperty('bottom'); document.querySelector('.quick-trigger').style.removeProperty('bottom'); window.dispatchEvent(new Event('scroll')); });
  await aligned('native_origin_restored_no_accumulation');
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'search'; input.id = 'synthetic-scroll-input'; input.setAttribute('aria-label', 'Synthetic viewport check'); document.querySelector('.app-canvas').prepend(input); });
  await page.getByRole('searchbox', { name: 'Synthetic viewport check' }).fill('synthetic');
  await page.setViewportSize({ width: 393, height: 550 });
  await page.evaluate(() => document.querySelector('#synthetic-scroll-input').blur());
  await page.setViewportSize({ width: 393, height: 852 });
  await aligned('viewport_restored_after_focus');
  await page.evaluate(() => document.querySelector('#synthetic-scroll-input').remove());
  await page.getByRole('button', { name: 'Mở thao tác nhanh' }).tap();
  await page.getByRole('dialog', { name: 'Ghi nhanh' }).getByRole('button', { name: 'Đóng', exact: true }).tap();
  await aligned('quick_sheet_closed');
  // Display a synthetic pixel instead of retrieving any family's original medical image.
  await page.route('**/api/pregnancy/documents/*', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=', 'base64') }));
  const original = page.getByRole('button', { name: /^Ảnh ·/ }).first();
  if (await original.count()) {
    await original.scrollIntoViewIfNeeded(); const before = await page.evaluate(() => scrollY);
    await original.tap(); const viewer = page.getByRole('dialog', { name: 'Xem tài liệu hồ sơ' });
    await viewer.getByRole('button', { name: 'Tải xuống' }).waitFor();
    await viewer.getByRole('button', { name: 'Quay lại hồ sơ' }).tap(); await viewer.waitFor({ state: 'hidden' });
    await aligned('image_viewer_closed');
    const restored = await page.evaluate(() => ({ y: scrollY, position: document.body.style.position, overflow: document.body.style.overflow }));
    if (Math.abs(before - restored.y) > 2 || restored.position || restored.overflow) throw new Error('viewer_scroll_not_restored');
    result.checks.push('viewer_preserves_reading_position');
  }
  const navLink = page.getByRole('navigation', { name: 'Điều hướng gia đình' }).getByRole('link').first();
  await navLink.focus(); if (!await navLink.evaluate(node => node === document.activeElement)) throw new Error('keyboard_nav_focus');
  result.checks.push('keyboard_nav'); result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = String(error.message).split('\n')[0]; process.exitCode = 1; }
finally {
  if (loggedIn) result.ownSessionRevoked = (await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303;
  await browser.close();
  await mkdir('data/mobile-scroll-verification', { recursive: true });
  await writeFile(`data/mobile-scroll-verification/${candidate ? 'candidate' : 'live'}.json`, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result));
