// Explicit live read-only feature check. Creates one normal login session and revokes only that session.
// No health data is submitted. No credentials or cookies are written to disk or printed.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EMBE_PLAYWRIGHT_PATH || 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const password = process.env.EMBE_VERIFY_PASSWORD;
const expected = process.env.EMBE_VERIFY_VERSION;
if (!password || !expected) throw new Error('verification_requires_password_and_version');
const health = await (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(15000) })).json();
if (health.version !== expected) { console.log(JSON.stringify({ status: 'deployment_pending', version: health.version })); process.exit(2); }
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
let loggedIn = false;
const result = { version: health.version, browser: 'Cent Browser, isolated headless', viewports: [], videos: [], warnings: [] };
const output = resolve('data/studio-web-verification');
await mkdir(output, { recursive: true });
try {
  const anonymous = await context.request.get(`${origin}/api/studio/ca-phe-tra-sua/video`, { maxRedirects: 0 });
  if (![303, 307, 401].includes(anonymous.status())) throw new Error('anonymous_media_not_protected');
  result.anonymousProtected = true;
  await page.goto(`${origin}/studio`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/studio`, { timeout: 45000 });
  loggedIn = true;
  await page.locator('.studio-topic').first().waitFor();
  if (await page.locator('.studio-topic').count() !== 8) throw new Error('missing_topics');
  await page.getByLabel('Tìm chủ đề').fill('om nghen');
  await page.waitForFunction(() => document.querySelectorAll('.studio-topic').length === 1, undefined, { timeout: 5000 });
  await page.getByLabel('Tìm chủ đề').fill('');
  await page.getByRole('button', { name: 'Ý tưởng 22' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.studio-ideas li').length === 22);
  await page.getByRole('button', { name: 'Kịch bản & video 8' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.studio-topic').length === 8);
  const sizes = [[375, 667], [393, 852], [430, 932], [412, 915], [768, 1024], [1280, 900]];
  async function checkSize(width, height, view) {
    await page.setViewportSize({ width, height });
    const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      smallTargets: [...document.querySelectorAll('.studio-main button, .studio-main input, .studio-main select, .studio-main summary, .studio-main a')]
        .filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.height < 43; }).length }));
    if (metrics.scroll > metrics.width + 1 || metrics.smallTargets) throw new Error(`layout_${view}_${width}`);
    result.viewports.push({ width, height, view, ...metrics });
  }
  for (const [width, height] of sizes) await checkSize(width, height, 'library');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: resolve(output, 'studio-iphone.png'), fullPage: true });
  const topics = await page.locator('.studio-topic').evaluateAll(elements => elements.map(element => element.getAttribute('href').split('/').pop()));
  for (const slug of topics) {
    const url = `${origin}/api/studio/${slug}/video`;
    const start = Date.now();
    const probe = await context.request.get(url, { headers: { range: 'bytes=0-1' } });
    if (probe.status() !== 206 || (await probe.body()).length !== 2 || !probe.headers()['content-range']?.startsWith('bytes 0-1/')) throw new Error(`range_${slug}`);
    const full = await context.request.get(url);
    if (full.status() !== 200 || !full.headers()['content-type']?.startsWith('video/mp4')) throw new Error(`video_${slug}`);
    const body = await full.body(); const checksum = createHash('sha256').update(body).digest('hex');
    if (full.headers().etag !== `"sha256-${checksum}"` || full.headers().location) throw new Error(`integrity_${slug}`);
    result.videos.push({ slug, bytes: body.length, range: 206, checksumVerified: true, milliseconds: Date.now() - start });
    console.log(`Live video verified: ${slug}`);
  }
  await page.goto(`${origin}/studio/ca-phe-tra-sua`, { waitUntil: 'domcontentloaded' });
  await page.locator('video').evaluate(video => video.play());
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video && video.currentTime > 0; });
  await page.locator('video').evaluate(video => { video.pause(); video.currentTime = 15; });
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video && !video.seeking && video.currentTime >= 15; });
  result.playbackAndSeek = true;
  for (const [width, height] of sizes) await checkSize(width, height, 'detail');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('summary').filter({ hasText: 'Nguồn đối chiếu' }).click();
  if (!(await page.locator('.studio-disclosure a').first().isVisible())) throw new Error('sources_not_accessible');
  await page.screenshot({ path: resolve(output, 'studio-detail-iphone.png'), fullPage: true });
  // Avoid overwriting the user's OS clipboard during unattended verification.
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__studioCopied = text; } } }); });
  await page.getByRole('button', { name: 'Chép caption', exact: true }).click();
  await page.waitForFunction(() => window.__studioCopied?.includes('#EmBeMeBau'));
  result.copyAction = true;
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Tải kịch bản dạng văn bản' }).click();
  const download = await downloadPromise;
  if (!download.suggestedFilename().endsWith('.txt') || await download.failure()) throw new Error('script_download_failed');
  result.scriptDownload = true;
  await page.keyboard.press('Tab');
  result.keyboardFocus = await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.matches(':focus-visible'));
  if (!result.keyboardFocus) throw new Error('keyboard_focus_missing');
  const home = await context.request.get(`${origin}/nha-minh`);
  if (!(await home.text()).includes('Mở Studio EmBe Mẹ Bầu')) throw new Error('missing_navigation');
  result.navigation = true;
  result.status = 'passed';
} catch (error) {
  if (new URL(page.url()).pathname.startsWith('/studio')) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
    console.log(JSON.stringify(await page.evaluate(() => ({ search: document.querySelector('input[type=search]')?.value,
      topics: document.querySelectorAll('.studio-topic').length, ideas: document.querySelectorAll('.studio-ideas li').length }))));
  }
  throw error;
} finally {
  if (loggedIn) {
    const logout = await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 });
    result.ownSessionRevoked = logout.status() === 303;
  }
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify(result));
