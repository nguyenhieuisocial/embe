// One explicitly synthetic upload; revoke only this login and soft-delete only its test record.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const expected = process.env.EMBE_VERIFY_VERSION;
const password = process.env.EMBE_VERIFY_PASSWORD;
if (!expected || !password) throw new Error('missing_verification_config');
const health = await (await fetch(`${origin}/api/health`)).json();
if (health.version !== expected) { console.log(JSON.stringify({ pending: true, version: health.version })); process.exit(2); }
const output = resolve('data/medical-recognition-verification');
await mkdir(output, { recursive: true });
const bytes = await readFile(resolve(output, 'receipt-synthetic.jpg'));
const recordId = randomUUID(); const documentId = randomUUID();
const result = { version: expected, recordId, documentId, syntheticOnly: true, browser: 'isolated Cent Browser', widths: [] };
await writeFile(resolve(output, 'live-result.json'), JSON.stringify(result, null, 2));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
// Dismiss only the optional guide in this isolated test profile; do not grant any device permissions.
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
const page = await context.newPage();
let loggedIn = false; let created = false;
async function jsonRequest(path, method, data) {
  return context.request.fetch(`${origin}${path}`, { method, headers: { origin, 'content-type': 'application/json' }, data });
}
try {
  const unauth = await context.request.get(`${origin}/api/pregnancy/documents/${documentId}/scan`, { maxRedirects: 0 });
  if (![303, 307, 401].includes(unauth.status())) throw new Error('anonymous_scan_access');
  result.anonymousBlocked = true;
  await page.goto(`${origin}/me-bau/ho-so`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/me-bau/ho-so`, { timeout: 45000 });
  loggedIn = true;
  const saved = await jsonRequest('/api/pregnancy/records', 'POST', {
    id: recordId, kind: 'receipt', status: 'completed', occurredAt: new Date().toISOString(),
    title: `EMBE_VERIFY_${recordId}`, provider: '', clinician: '', notes: 'SYNTHETIC TEST; NOT FAMILY MEDICAL DATA',
    gestationalWeek: null, nextAppointmentAt: null, measurements: {}, medicines: []
  });
  if (![200, 201].includes(saved.status())) throw new Error(`record_create_${saved.status()}`);
  created = true;
  const upload = await jsonRequest(`/api/pregnancy/records/${recordId}/documents`, 'POST', {
    documentId, filename: 'EMBE_SYNTHETIC_RECEIPT.jpg', mimeType: 'image/jpeg', byteSize: bytes.length
  });
  if (upload.status() !== 201) throw new Error(`upload_session_${upload.status()}`);
  const { uploadUrl } = await upload.json();
  if (new URL(uploadUrl).origin !== 'https://tpqqzowhndbkmkckpbgv.supabase.co') throw new Error('unexpected_upload_origin');
  const form = new FormData(); form.append('cacheControl', '0'); form.append('', new Blob([bytes], { type: 'image/jpeg' }), 'EMBE_SYNTHETIC_RECEIPT.jpg');
  const uploaded = await fetch(uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form });
  if (!uploaded.ok) throw new Error(`upload_${uploaded.status}`);
  if ((await jsonRequest(`/api/pregnancy/documents/${documentId}`, 'POST', {})).status() !== 202) throw new Error('upload_complete');
  await page.goto(`${origin}/me-bau/ho-so/tai-lieu/${documentId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Đọc tài liệu', exact: true }).click();
  const endpoint = `/api/pregnancy/documents/${documentId}/scan`;
  const started = Date.now();
  let scan;
  while (Date.now() - started < 180000) {
    scan = await (await context.request.get(`${origin}${endpoint}`)).json();
    if (scan.status === 'review') break;
    if (scan.status === 'failed') throw new Error(`scan_failed_${scan.error}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (scan?.status !== 'review' || scan.analysis?.pages[0]?.kind !== 'receipt') throw new Error('recognition_incomplete');
  result.secondsUntilReview = (Date.now() - started) / 1000;
  result.pageCount = scan.analysis.pages.length;
  result.charges = scan.analysis.pages[0].charges.length;
  console.log('Synthetic receipt uploaded and recognized through the live worker.');
  await page.getByText('Đã đọc · cần đối chiếu', { exact: true }).waitFor();
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Phiếu thu mẫu đã đối chiếu');
  await page.getByRole('button', { name: /Thêm khoản thu/ }).click();
  const row = page.locator('.document-group').filter({ has: page.getByRole('heading', { name: /Khoản thu và thanh toán/ }) }).locator('details').last();
  await row.locator('summary').click();
  await row.getByLabel('Tên mục / chỉ số', { exact: true }).fill('Khoản mẫu chỉnh tay');
  await row.getByLabel('Số tiền nguyên văn').fill('0');
  await row.getByLabel('Tiền tệ trên phiếu').fill('VND');
  await page.getByLabel('Tôi đã đối chiếu các trang với bản gốc').check();
  await page.getByRole('button', { name: 'Lưu bản đối chiếu' }).click();
  await page.getByText('Đã lưu bản đối chiếu vào tài liệu này.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Đã xác nhận', { exact: true }).waitFor();
  if (await page.getByLabel('Tiêu đề', { exact: true }).inputValue() !== 'Phiếu thu mẫu đã đối chiếu') throw new Error('edit_not_persisted');
  if (!(await page.getByText('Khoản mẫu chỉnh tay', { exact: true }).isVisible())) throw new Error('added_row_not_persisted');
  result.editAddConfirmReload = true;
  const stale = await jsonRequest(endpoint, 'PATCH', { revision: scan.revision, analysis: scan.analysis, confirmed: true });
  if (stale.status() !== 409) throw new Error('stale_revision_not_blocked');
  result.staleRevisionBlocked = true;
  const original = await context.request.get(`${origin}/api/pregnancy/documents/${documentId}`);
  if (original.status() !== 200 || !(await original.body()).equals(bytes)) throw new Error('original_changed');
  result.originalUnchanged = true;
  for (const width of [375, 393, 430, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
      small: [...document.querySelectorAll('.document-review button,.document-review a,.document-review summary,.document-review input:not([type=checkbox]),.document-review select')]
        .some(node => { const r = node.getBoundingClientRect(); return r.height > 0 && r.height < 43; }) }));
    if (metrics.overflow || metrics.small) throw new Error(`layout_${width}`);
    result.widths.push(width);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('heading', { name: 'Đọc & đối chiếu', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, 'live-review-iphone.png'), fullPage: true });
  result.status = 'passed';
} catch (error) {
  // Playwright request errors can contain cookies; never print their stack or call log.
  result.status = 'failed'; result.error = String(error.message).split('\n')[0];
  process.exitCode = 1;
} finally {
  if (created) {
    const deleted = await jsonRequest(`/api/pregnancy/records/${recordId}`, 'DELETE');
    result.syntheticRecordSoftDeleted = deleted.status() === 200;
    const gone = await context.request.get(`${origin}/api/pregnancy/documents/${documentId}/scan`);
    result.deletedRecordBlocked = gone.status() === 404;
  }
  if (loggedIn) {
    const logout = await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 });
    result.ownSessionRevoked = logout.status() === 303;
  }
  await writeFile(resolve(output, 'live-result.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify(result));
