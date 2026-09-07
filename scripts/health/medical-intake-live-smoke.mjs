// Own synthetic documents only. Uses a separate, headless Cent profile, never a user's tab.
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
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
const result = { version: expected, syntheticOnly: true, browser: 'isolated Cent', widths: [], records: [] };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())));
const page = await context.newPage(); let loggedIn = false; let documentId;
const json = (path, method, data) => context.request.fetch(`${origin}${path}`, { method, headers: { origin, 'content-type': 'application/json' }, data });
try {
  // Render an artificial test sheet, no patient images or family data involved.
  const fixture = await browser.newPage({ viewport: { width: 1700, height: 2100 } });
  await fixture.setContent('<html lang="vi"><meta charset="utf-8"><body style="font:44px Arial;padding:80px;line-height:1.8;background:white;color:black"><h1 style="font-size:52px">PHIẾU SIÊU ÂM MẪU</h1><p>Bệnh viện: BV Mẫu EmBe</p><p>Họ tên: NGƯỜI MẪU</p><p>Ngày khám: 07/09/2026</p><p>Bác sĩ: BS Mẫu</p><p>Tuổi thai: 12 tuần</p><p>CRL: 45,6 mm</p><p>NT: 1,2 mm</p><p>Nhịp tim thai: 160 lần/phút</p><p>DỮ LIỆU KIỂM TRA — KHÔNG PHẢI HỒ SƠ THẬT</p></body></html>');
  const file = resolve(output, 'intake-synthetic.png'); await fixture.screenshot({ path: file }); await fixture.close();
  await page.goto(`${origin}/me-bau/ho-so`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
  await page.waitForURL(`${origin}/me-bau/ho-so`, { timeout: 45000 }); loggedIn = true;
  const linked = randomUUID();
  const created = await json('/api/pregnancy/records', 'POST', { id: linked, kind: 'appointment', status: 'completed', occurredAt: '2026-09-07T02:00:00Z',
    title: 'EMBE SYNTHETIC MATCH VISIT', provider: 'BV Mẫu EmBe', clinician: '', notes: 'Synthetic only. Do not use clinically.', gestationalWeek: null, nextAppointmentAt: null, measurements: {}, medicines: [] });
  if (created.status() !== 200) throw new Error(`fixture_visit_${created.status()}`); result.records.push(linked);
  // Refresh only this isolated browser, so matching can see the newly created test visit.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Chụp giấy tờ', exact: true }).waitFor();
  if (await page.getByLabel('Chụp giấy tờ khám').getAttribute('capture') !== 'environment') throw new Error('camera_capture_missing');
  await page.locator('.medical-intake').screenshot({ path: resolve(output, 'intake-mobile.png') });
  const started = Date.now();
  await page.getByLabel('Chọn giấy tờ khám', { exact: true }).setInputFiles(file);
  const open = page.locator('.medical-intake').getByRole('link', { name: 'Xem bản đọc' }); await open.waitFor({ timeout: 120000 });
  documentId = (await open.getAttribute('href')).split('/').pop(); result.documentId = documentId;
  let scan = await (await context.request.get(`${origin}/api/pregnancy/documents/${documentId}/scan`)).json();
  if (!scan.recordId) throw new Error('scan_record_missing'); result.records.push(scan.recordId);
  const recordId = scan.recordId;
  await open.click();
  while (Date.now() - started < 240000 && !['review', 'failed'].includes(scan.status)) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    scan = await (await context.request.get(`${origin}/api/pregnancy/documents/${documentId}/scan`)).json();
  }
  if (scan.status !== 'review') throw new Error(`recognition_${scan.status}_${scan.error ?? ''}`);
  result.secondsUploadToReview = (Date.now() - started) / 1000;
  result.recognizedKind = scan.analysis.pages[0].kind;
  if (result.recognizedKind !== 'ultrasound') throw new Error('wrong_document_kind');
  await page.getByRole('button', { name: 'Xác nhận & thêm vào hồ sơ', exact: true }).waitFor({ timeout: 15000 });
  if (await page.getByLabel('Ngày khám / ngày trên giấy').inputValue() !== '2026-09-07') throw new Error('date_not_extracted');
  if (await page.getByLabel('Cơ sở khám', { exact: true }).inputValue() !== 'BV Mẫu EmBe') throw new Error('provider_not_extracted');
  if (await page.getByLabel('Liên kết lần khám').inputValue() !== linked) throw new Error('visit_not_matched');
  result.autoMatch = true;
  await page.getByText('Kiểm tra ngày, cơ sở và lần khám', { exact: true }).click();
  await page.getByLabel('Tên hồ sơ', { exact: true }).fill('EMBE SYNTHETIC IMPORTED SCAN');
  for (const width of [375, 393, 430, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
      badTargets: [...document.querySelectorAll('.document-import button,.document-import input:not([type=checkbox]),.document-import select')]
        .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height < 43).length }));
    result.widths.push({ width, ...metrics }); if (metrics.overflow || metrics.badTargets) throw new Error(`mobile_layout_${width}`);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('.document-import').screenshot({ path: resolve(output, 'intake-review-mobile.png') });
  const ack = page.getByLabel('Đây là giấy tờ của Mẹ Ngân; tôi đã đối chiếu thông tin và dữ liệu sẽ thêm với bản gốc.');
  await ack.check();
  await page.getByRole('button', { name: 'Xác nhận & thêm vào hồ sơ', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Đã thêm dữ liệu vào hồ sơ', { exact: true }).waitFor({ timeout: 25000 });
  const loaded = await (await context.request.get(`${origin}/api/pregnancy/records`)).json();
  const stored = loaded.records.find(r => r.id === recordId);
  if (!stored || stored.documentIntake || stored.linkedRecordId !== linked || stored.provider !== 'BV Mẫu EmBe'
    || stored.measurements.crlMm !== 45.6 || stored.measurements.ntMm !== 1.2 || stored.measurements.fetalHeartRate !== 160) throw new Error('structured_import_incomplete');
  result.structuredMeasurements = stored.measurements;
  const after = await (await context.request.get(`${origin}/api/pregnancy/documents/${documentId}/scan`)).json();
  if (after.status !== 'confirmed') throw new Error('transcription_not_confirmed');
  const original = await context.request.get(`${origin}/api/pregnancy/documents/${documentId}`);
  if (!(await original.body()).equals(await readFile(file))) throw new Error('original_changed'); result.originalUnchanged = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Đã thêm dữ liệu vào hồ sơ', { exact: true }).waitFor(); result.persistedAfterReload = true;
  await page.getByRole('link', { name: 'Xem hồ sơ đã cập nhật', exact: true }).click();
  await page.locator(`#record-${recordId}`).waitFor();
  result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = String(error.message).split('\n')[0]; process.exitCode = 1; }
finally {
  result.cleanup = [];
  for (const id of [...result.records].reverse()) {
    try { const response = await json(`/api/pregnancy/records/${id}`, 'DELETE'); result.cleanup.push({ id, softDeleted: response.status() === 200 }); }
    catch { result.cleanup.push({ id, softDeleted: false }); }
  }
  if (documentId) { try { result.deletedDocumentBlocked = (await context.request.get(`${origin}/api/pregnancy/documents/${documentId}/import`)).status() === 404; } catch { result.deletedDocumentBlocked = false; } }
  if (loggedIn) { try { result.ownSessionRevoked = (await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 })).status() === 303; } catch { result.ownSessionRevoked = false; } }
  if (result.cleanup.some(r => !r.softDeleted) || loggedIn && !result.ownSessionRevoked) { result.status = 'cleanup_needed'; process.exitCode = 1; }
  await writeFile(resolve(output, 'intake-live-result.json'), JSON.stringify(result, null, 2)); await browser.close();
}
console.log(JSON.stringify(result));
