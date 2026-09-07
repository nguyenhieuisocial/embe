// Explicit live read-only feature check. Creates one normal login session and revokes only that session.
// No health data is submitted. No credentials or cookies are written to disk or printed.
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EMBE_PLAYWRIGHT_PATH || 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const password = process.env.EMBE_VERIFY_PASSWORD;
const expected = process.env.EMBE_VERIFY_VERSION;
const catalog = JSON.parse(await readFile(resolve('apps/portal/src/content/studio-catalog.json'), 'utf8'));
const narrated = catalog.topics.filter(topic => topic.audio === true);
const targetSlug = narrated[0]?.slug ?? 'ca-phe-tra-sua';
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
  const anonDiscovery = await context.request.get(`${origin}/api/studio/discovery`, { maxRedirects: 0 });
  if (![303, 307, 401].includes(anonDiscovery.status())) throw new Error('anonymous_discovery_not_protected');
  await page.goto(`${origin}/studio`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/studio`, { timeout: 45000 });
  loggedIn = true;
  await page.locator('.studio-topic').first().waitFor();
  if (await page.locator('.studio-topic').count() !== catalog.topics.length) throw new Error('missing_topics');
  await page.getByLabel('Tìm chủ đề').fill('ca phe');
  await page.waitForFunction(() => document.querySelectorAll('.studio-topic').length === 1, undefined, { timeout: 5000 });
  await page.getByLabel('Tìm chủ đề').fill('');
  await page.getByRole('button', { name: `Ý tưởng ${catalog.ideas.length}` }).click();
  await page.waitForFunction(count => document.querySelectorAll('.studio-ideas li').length === count, catalog.ideas.length);
  await page.getByRole('button', { name: `Kịch bản & video ${catalog.topics.length}` }).click();
  await page.waitForFunction(count => document.querySelectorAll('.studio-topic').length === count, catalog.topics.length);
  if (await page.getByText(/Có giọng đọc AI/).count() !== narrated.length) throw new Error('narration_labels_mismatch');
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
  await page.getByRole('link', { name: 'Khám phá chủ đề & lưu ý tưởng', exact: true }).click();
  await page.waitForURL('**/studio/kham-pha');
  await page.getByText('Đã lấy tín hiệu từ Google Trends Việt Nam.', { exact: true }).waitFor({ state: 'attached' });
  const trend1 = await context.request.get(`${origin}/api/studio/discovery`);
  const feed1 = await trend1.json(); const feed2 = await (await context.request.get(`${origin}/api/studio/discovery`)).json();
  if (feed1.status !== 'ready' || !feed1.xml.includes('<rss') || feed1.checkedAt !== feed2.checkedAt || trend1.headers()['cache-control'] !== 'private, no-store') throw new Error('discovery_feed_cache');
  await page.getByRole('combobox', { name: /^Từ khóa/ }).selectOption('zh');
  if (!(await page.getByRole('link', { name: 'Rednote', exact: true }).getAttribute('href')).includes('%E5')) throw new Error('discovery_multilingual_query');
  await page.getByRole('combobox', { name: /^Từ khóa/ }).selectOption('vi');
  for (const [width, height] of sizes) await checkSize(width, height, 'discovery');
  await page.getByText('Những mẫu Rednote đã xem', { exact: true }).click();
  await page.getByRole('button', { name: 'Lưu mẫu này', exact: true }).first().click();
  const boardKey = 'embe:studio-discovery:v1';
  const readBoard = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), boardKey);
  if ((await readBoard()).length !== 1) throw new Error('discovery_save');
  await page.getByRole('button', { name: 'Lưu mẫu này', exact: true }).first().click();
  if ((await readBoard()).length !== 1) throw new Error('discovery_dedup');
  await page.getByText('Sửa ý tưởng & ghi số liệu', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Tên ý tưởng', exact: true }).fill('Ý tưởng kiểm tra riêng');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Ý tưởng kiểm tra riêng', exact: true }).waitFor();
  await page.getByText('Sửa ý tưởng & ghi số liệu', { exact: true }).click();
  await page.getByRole('button', { name: 'Xóa ý tưởng', exact: true }).click();
  if ((await readBoard()).length) throw new Error('discovery_delete');
  await page.getByRole('button', { name: 'Hoàn tác xóa', exact: true }).click();
  if ((await readBoard())[0]?.title !== 'Ý tưởng kiểm tra riêng') throw new Error('discovery_undo');
  await page.getByText('Sao lưu & chuyển máy', { exact: true }).click();
  const exportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất sổ JSON', exact: true }).click();
  const exported = await exportPromise; const file = await exported.path();
  const exportedData = JSON.parse(await readFile(file, 'utf8'));
  if (exportedData.version !== 1 || exportedData.items[0].title !== 'Ý tưởng kiểm tra riêng' || /xsec_token/.test(JSON.stringify(exportedData))) throw new Error('discovery_export');
  await page.getByLabel('Nhập sổ JSON', { exact: true }).setInputFiles(file);
  await page.getByText('Đã nhập link mới, giữ ghi chú hiện có.', { exact: true }).waitFor();
  if ((await readBoard()).length !== 1) throw new Error('discovery_import');
  await page.getByText('Sao lưu & chuyển máy', { exact: true }).click();
  await page.getByText('Sửa ý tưởng & ghi số liệu', { exact: true }).click();
  for (const [width, height] of sizes) await checkSize(width, height, 'discovery-editor');
  await page.getByRole('button', { name: 'Xóa ý tưởng', exact: true }).click();
  await page.evaluate(key => localStorage.removeItem(key), boardKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('heading', { name: 'Khám phá chủ đề', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'studio-discovery-iphone.png'), fullPage: true });
  result.discovery = { googleTrendsReady: true, cacheReused: true, canonicalSaveEditReloadDeleteUndo: true, exportImport: true, multilingual: true, localOnlyDisclosure: true };
  await page.getByRole('link', { name: '‹ Về Studio' }).click();
  await page.waitForURL('**/studio');
  await page.getByRole('link', { name: 'Nghiên cứu & hướng nội dung' }).click();
  await page.waitForURL('**/studio/nghien-cuu');
  if (!await page.getByText(/Chưa đọc hết từng ảnh/).isVisible()) throw new Error('research_scope_missing');
  for (const [width, height] of sizes) await checkSize(width, height, 'research');
  await page.getByText('Công cụ đã rà và lựa chọn cho EmBe', { exact: true }).click();
  if (!await page.getByRole('link', { name: 'MediaCrawler', exact: true }).isVisible()) throw new Error('research_tools_missing');
  await page.getByText('Những khẳng định cần sửa', { exact: true }).click();
  if (!await page.getByRole('link', { name: 'TikTok — Content Sharing Guidelines', exact: true }).isVisible()) throw new Error('research_sources_missing');
  await page.setViewportSize({ width: 393, height: 852 });
  await checkSize(393, 852, 'research-expanded');
  await page.getByText('Công cụ đã rà và lựa chọn cho EmBe', { exact: true }).click();
  await page.getByText('Những khẳng định cần sửa', { exact: true }).click();
  await page.screenshot({ path: resolve(output, 'studio-research-iphone.png'), fullPage: true });
  result.research = { coverageVisible: true, expandableTools: true, sourcesVisible: true };
  await page.getByRole('link', { name: '‹ Về Studio' }).click();
  await page.waitForURL('**/studio');
  await page.setViewportSize({ width: 393, height: 852 });
  // Full-page captures do not wait for lazy images below the viewport. Scroll each
  // preview into view and verify decoding so a blank thumbnail cannot pass.
  const posters = page.locator('.studio-topic img');
  for (let index = 0; index < await posters.count(); index++) {
    const poster = posters.nth(index);
    await poster.scrollIntoViewIfNeeded();
    await poster.evaluate(image => image.decode());
    if (!(await poster.evaluate(image => image.naturalWidth > 0))) throw new Error('poster_decode_failed');
  }
  result.postersDecoded = await posters.count();
  await page.evaluate(() => window.scrollTo(0, 0));
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
  await page.goto(`${origin}/studio/${targetSlug}`, { waitUntil: 'domcontentloaded' });
  await page.locator('video').evaluate(video => video.play());
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video && video.currentTime > 0; });
  await page.locator('video').evaluate(video => { video.pause(); video.currentTime = 15; });
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video && !video.seeking && video.currentTime >= 15; });
  result.playbackAndSeek = true;
  if (narrated.length) {
    if (!await page.getByText(/Có giọng đọc AI tiếng Việt/).isVisible()) throw new Error('missing_voice_hint');
    result.decodedAudioBytes = await page.locator('video').evaluate(video => video.webkitAudioDecodedByteCount ?? null);
    if (result.decodedAudioBytes !== null && result.decodedAudioBytes <= 0) throw new Error('audio_not_decoded');
    await page.getByText('Minh họa & giọng đọc', { exact: true }).click();
    if (!await page.getByRole('link', { name: 'Nguồn mô hình giọng đọc' }).isVisible()) throw new Error('missing_voice_attribution');
  }
  for (const [width, height] of sizes) await checkSize(width, height, 'detail');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('summary').filter({ hasText: 'Nguồn đối chiếu' }).click();
  if (!(await page.locator('.studio-disclosure a').first().isVisible())) throw new Error('sources_not_accessible');
  await page.locator('.studio-heading h1').click();
  await page.evaluate(() => window.scrollTo(0, 0));
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
  result.status = 'failed';
  result.error = error instanceof Error && /^[a-zA-Z0-9_-]+$/.test(error.message) ? error.message : 'verification_failed';
  result.failurePoint = error instanceof Error ? error.stack?.match(/studio-live-smoke\.mjs:(\d+):\d+/)?.[1] ?? null : null;
  process.exitCode = 1;
} finally {
  if (loggedIn) {
    const logout = await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 });
    result.ownSessionRevoked = logout.status() === 303;
  }
  await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify(result));
