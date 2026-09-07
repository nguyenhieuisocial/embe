// Read only public reference pages in an isolated Cent Browser; never download/rehost source media.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const urls = process.argv.length > 2 ? process.argv.slice(2) : [
 'https://xhslink.cn/o/4B8ecxU4sXy',
 'https://xhslink.cn/o/1aZ6p61EJt7',
 'https://www.tiktok.com/@minhnhatkhampha/video/7614733453463981332',
 'https://www.tiktok.com/@cccc1780/photo/7664579068561739029',
 'https://www.tiktok.com/@gocuathi1tv/video/7673362168347217172',
 'https://www.tiktok.com/@bechuot2923/video/7679623757366840583',
 'https://www.tiktok.com/@gocuathi1tv/video/7657778402291682581',
 'https://www.tiktok.com/@duoc.si.cham.con/photo/7476727861475331336',
 'https://www.tiktok.com/@nuoicondema2026/video/7636636878485196040'
];
const output = `data/studio-reference-review/${process.argv.length > 2 ? 'specific' : 'initial'}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const results = [];
try {
 for (const [index, url] of urls.entries()) {
  const page = await context.newPage();
  let status = null, error = null;
  try { status = (await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }))?.status(); }
  catch (e) { error = e.name; }
  await page.waitForTimeout(2500);
  const result = { index, requestedUrl: url, url: page.url(), status, error, title: await page.title(),
   text: (await page.locator('body').innerText().catch(() => '')).slice(0, 12000),
   media: await page.locator('video').evaluateAll(nodes => nodes.map(node => ({ paused: node.paused, duration: Number.isFinite(node.duration) ? node.duration : null, width: node.videoWidth, height: node.videoHeight }))) };
  await page.screenshot({ path: `${output}/${index}.png`, timeout: 10000 }).catch(() => {});
  results.push(result);
  await writeFile(`${output}/inspection.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(result));
  await page.close();
 }
} finally { await browser.close(); }
