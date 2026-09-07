// Real authenticated upload/download; only a new, labelled synthetic record is written and soft-deleted.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const expected = process.env.EMBE_VERIFY_VERSION; const password = process.env.EMBE_VERIFY_PASSWORD;
if (!expected || !password) throw new Error('missing_verification_config');
const health = await (await fetch(`${origin}/api/health`)).json();
if (health.version !== expected) { console.log(JSON.stringify({ pending: true, version: health.version })); process.exit(2); }
const output = resolve('data/medical-recognition-verification'); await mkdir(output, { recursive: true });
const recordId = randomUUID(); const imageId = randomUUID(); const pdfId = randomUUID();
const result = { version: expected, syntheticOnly: true, recordId, imageId, pdfId, browser: 'isolated Cent Browser', widths: [] };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
const page = await context.newPage();
const csp = []; page.on('console', message => { if (message.text().includes('Content Security Policy')) csp.push(message.text().slice(0, 300)); });
let loggedIn = false; let created = false;
const request = (path, method, data) => context.request.fetch(`${origin}${path}`, { method, headers: { origin, 'content-type': 'application/json' }, data });
async function upload(id, filename, mimeType, bytes) {
  const session = await request(`/api/pregnancy/records/${recordId}/documents`, 'POST', { documentId: id, filename, mimeType, byteSize: bytes.length });
  if (session.status() !== 201) throw new Error(`upload_session_${session.status()}`);
  const { uploadUrl } = await session.json();
  if (new URL(uploadUrl).origin !== 'https://tpqqzowhndbkmkckpbgv.supabase.co') throw new Error('unexpected_upload_origin');
  const form = new FormData(); form.append('cacheControl', '0'); form.append('', new Blob([bytes], { type: mimeType }), filename);
  if (!(await fetch(uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form })).ok) throw new Error('upload_failed');
  if ((await request(`/api/pregnancy/documents/${id}`, 'POST', {})).status() !== 202) throw new Error('upload_incomplete');
}
function syntheticPdf() {
  const stream = 'BT /F1 24 Tf 40 730 Td (EMBE SYNTHETIC DOCUMENT) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
const dialog = page.getByRole('dialog', { name: 'Xem tài liệu hồ sơ' });
async function loadedImage() { const image = dialog.getByRole('img'); await image.waitFor(); await image.evaluate(node => node.decode()); return image; }
async function closed() {
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => !history.state?.embeMedicalViewer);
}
try {
  await page.goto(`${origin}/me-bau/ho-so`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/me-bau/ho-so`, { timeout: 45000 }); loggedIn = true;
  const saved = await request('/api/pregnancy/records', 'POST', { id: recordId, kind: 'other', status: 'completed', occurredAt: new Date().toISOString(),
    title: `EMBE_VIEWER_VERIFY_${recordId}`, provider: '', clinician: '', notes: 'SYNTHETIC UI TEST; NOT FAMILY MEDICAL DATA', gestationalWeek: null, nextAppointmentAt: null, measurements: {}, medicines: [] });
  if (![200, 201].includes(saved.status())) throw new Error(`record_create_${saved.status()}`); created = true;
  const imageBytes = await readFile(resolve(output, 'receipt_long-dense.jpg')); const pdfBytes = syntheticPdf();
  await upload(imageId, 'EMBE_SYNTHETIC_VIEWER.jpg', 'image/jpeg', imageBytes);
  await upload(pdfId, 'EMBE_SYNTHETIC_VIEWER.pdf', 'application/pdf', pdfBytes);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const trigger = page.locator(`#record-${recordId}`).getByRole('button', { name: 'Ảnh · EMBE_SYNTHETIC_VIEWER.jpg' });
  await trigger.scrollIntoViewIfNeeded(); const y = await page.evaluate(() => scrollY); const url = page.url();
  await trigger.click(); const image = await loadedImage();
  if (page.url() !== url || context.pages().length !== 1) throw new Error('left_app_or_new_tab');
  await image.dblclick();
  if (!(await image.getAttribute('style')).includes('scale(2)')) throw new Error('captured_double_tap_failed');
  await image.dblclick();
  if (!(await image.getAttribute('style')).includes('scale(1)')) throw new Error('double_tap_reset_failed');
  result.doubleTap = true;
  await dialog.getByRole('button', { name: 'Phóng to ảnh' }).click();
  if (!(await image.getAttribute('style')).includes('scale(1.5)')) throw new Error('zoom_failed');
  await dialog.getByRole('button', { name: 'Xoay ảnh' }).click();
  if (!(await image.getAttribute('style')).includes('rotate(90deg)')) throw new Error('rotation_failed');
  await dialog.getByRole('button', { name: 'Vừa khung ảnh' }).click();
  await dialog.getByRole('button', { name: 'Quay lại hồ sơ' }).click(); await closed();
  if (Math.abs((await page.evaluate(() => scrollY)) - y) > 3) throw new Error('lost_scroll');
  if (!(await trigger.evaluate(node => document.activeElement === node))) throw new Error('lost_focus');
  result.backButtonRestoresPosition = true;
  await trigger.click(); await loadedImage(); await page.goBack(); await closed();
  if (page.url() !== url) throw new Error('browser_back_left_record'); result.browserBack = true;
  await trigger.click(); await loadedImage(); await page.keyboard.press('Escape'); await closed(); result.escape = true;
  await trigger.click(); await loadedImage();
  await dialog.getByRole('button', { name: 'Quay lại hồ sơ' }).focus(); await page.keyboard.press('Shift+Tab');
  if (!(await page.evaluate(() => document.activeElement?.closest('dialog') !== null))) throw new Error('focus_escaped'); result.focusTrap = true;
  const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Tải xuống' }).click();
  const file = await downloaded;
  if (file.suggestedFilename() !== 'EMBE_SYNTHETIC_VIEWER.jpg' || !(await readFile(await file.path())).equals(imageBytes)) throw new Error('download_changed_original');
  result.originalDownload = true;
  await dialog.getByRole('button', { name: 'Sau ›' }).click(); await dialog.locator('iframe').waitFor();
  if (!(await dialog.locator('iframe').getAttribute('src')).startsWith('blob:')) throw new Error('pdf_not_private_blob');
  await dialog.getByRole('button', { name: '‹ Trước' }).click(); await loadedImage(); result.documentNavigation = true;
  for (const [width, height] of [[375, 812], [393, 852], [430, 932], [412, 915], [768, 1024], [1280, 900], [852, 393]]) {
    await page.setViewportSize({ width, height });
    const layout = await dialog.evaluate(node => ({ overflow: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
      small: [...node.querySelectorAll('button')].filter(button => button.getClientRects().length).some(button => { const r = button.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }),
      closeVisible: (() => { const r = node.querySelector('.medical-viewer-done').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; })() }));
    result.widths.push({ width, height, ...layout }); if (layout.overflow || layout.small || !layout.closeVisible) throw new Error(`layout_${width}`);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: resolve(output, 'viewer-mobile.png') });
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click(); await closed();
  await context.setOffline(true); await trigger.click(); await dialog.getByRole('alert').waitFor();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click(); await closed(); await context.setOffline(false); result.offlineExit = true;
  // Only the transcription GET of this synthetic record is stubbed to exercise unsaved review text deterministically.
  await page.route(`**/api/pregnancy/documents/${imageId}/scan`, route => route.fulfill({ json: { documentId: imageId, recordId, filename: 'EMBE_SYNTHETIC_VIEWER.jpg', mimeType: 'image/jpeg', status: 'review', revision: 1,
    analysis: { version: 1, pages: [{ page: 1, kind: 'other', title: 'Synthetic', fields: [], medicines: [], charges: [], warnings: [] }] } } }));
  await page.goto(`${origin}/me-bau/ho-so/tai-lieu/${imageId}`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Unsaved synthetic draft');
  await page.getByRole('button', { name: /Xem toàn màn hình/ }).click(); await loadedImage();
  await page.goBack(); await closed();
  if (await page.getByLabel('Tiêu đề', { exact: true }).inputValue() !== 'Unsaved synthetic draft') throw new Error('lost_unsaved_draft');
  result.unsavedReviewPreservedWithSyntheticScan = true;
  if (csp.length) throw new Error('viewer_csp_violation'); result.noCspViolations = true;
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = String(error.message).split('\n')[0]; process.exitCode = 1;
  await page.screenshot({ path: resolve(output, 'viewer-failure.png') }).catch(() => {});
} finally {
  await context.setOffline(false);
  if (created) {
    try { result.syntheticRecordSoftDeleted = (await request(`/api/pregnancy/records/${recordId}`, 'DELETE')).status() === 200; }
    catch { result.syntheticRecordSoftDeleted = false; }
  }
  if (loggedIn) {
    try { result.ownSessionRevoked = (await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303; }
    catch { result.ownSessionRevoked = false; }
  }
  if ((created && !result.syntheticRecordSoftDeleted) || (loggedIn && !result.ownSessionRevoked)) { result.status = 'cleanup_needed'; process.exitCode = 1; }
  await writeFile(resolve(output, 'viewer-live-result.json'), JSON.stringify(result, null, 2)); await browser.close();
}
console.log(JSON.stringify(result));
