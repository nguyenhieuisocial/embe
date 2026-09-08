// One explicitly synthetic upload; revoke only this login and soft-delete only its test record.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

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
const ruledPdf = process.argv.includes('--ruled-pdf');
const importRouting = process.argv.includes('--import-routing');
if (importRouting && !ruledPdf) throw new Error('routing_requires_synthetic_pdf');
const bytes = await readFile(ruledPdf ? resolve('services/media-ingest/tests/fixtures/synthetic-ruled-medical.pdf') : resolve(output, 'receipt_long-dense.jpg'));
const filename = ruledPdf ? 'EMBE_SYNTHETIC_RULED_TABLES.pdf' : 'EMBE_SYNTHETIC_RECEIPT.jpg';
const mimeType = ruledPdf ? 'application/pdf' : 'image/jpeg';
const recordId = randomUUID(); const documentId = randomUUID();
const result = { version: expected, recordId, documentId, syntheticOnly: true, fixture: filename, browser: 'isolated Cent Browser', widths: [] };
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
    documentId, filename, mimeType, byteSize: bytes.length
  });
  if (upload.status() !== 201) throw new Error(`upload_session_${upload.status()}`);
  const { uploadUrl } = await upload.json();
  if (new URL(uploadUrl).origin !== 'https://tpqqzowhndbkmkckpbgv.supabase.co') throw new Error('unexpected_upload_origin');
  const form = new FormData(); form.append('cacheControl', '0'); form.append('', new Blob([bytes], { type: mimeType }), filename);
  const uploaded = await fetch(uploadUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form });
  if (!uploaded.ok) throw new Error(`upload_${uploaded.status}`);
  if ((await jsonRequest(`/api/pregnancy/documents/${documentId}`, 'POST', {})).status() !== 202) throw new Error('upload_complete');
  await page.goto(`${origin}/me-bau/ho-so/tai-lieu/${documentId}`, { waitUntil: 'domcontentloaded' });
  // Upload completion now queues every document atomically; no second tap required.
  const endpoint = `/api/pregnancy/documents/${documentId}/scan`;
  const started = Date.now();
  let scan;
  while (Date.now() - started < (ruledPdf ? 300000 : 180000)) {
    scan = await (await context.request.get(`${origin}${endpoint}`)).json();
    if (scan.status === 'review') break;
    if (scan.status === 'failed') throw new Error(`scan_failed_${scan.error}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (scan?.status !== 'review' || scan.analysis?.pages[0]?.kind !== (ruledPdf ? 'laboratory' : 'receipt')) throw new Error('recognition_incomplete');
  result.secondsUntilReview = (Date.now() - started) / 1000;
  result.pageCount = scan.analysis.pages.length;
  result.independentOcrEveryPage = scan.analysis.pages.every(page => page.ocrText?.length > 80 && page.ocrEngine === 'tesseract-vie-eng');
  if (!result.independentOcrEveryPage) throw new Error('independent_ocr_source_missing');
  const receipt = scan.analysis.pages[ruledPdf ? 2 : 0];
  result.charges = receipt.charges.length;
  result.receiptLineAmounts = (ruledPdf ? ['250.000', '350.000', '50.000', '550.000'] : ['251.000', '254.500', '279.000', '289.500', '3.200.000']).every(amount => receipt.charges.some(row => row.amount.includes(amount)));
  if (!result.receiptLineAmounts) throw new Error('receipt_line_items_missing');
  if (ruledPdf) {
    const [lab, prescription] = scan.analysis.pages;
    result.pdfTables = lab.fields.some(row => row.label === 'HGB' && row.value === '11,2' && row.unit === 'g/dL' && row.pdfEvidence?.includes('|'))
      && lab.fields.some(row => row.label === 'TSH' && row.value === '< 0,01' && row.unit === 'mIU/L')
      && prescription.kind === 'prescription' && prescription.medicines.some(row => row.dose === '1 viên' && row.quantity === '10 viên' && row.duration === '5 ngày' && row.instructions.includes('không uống khi đói'))
      && receipt.kind === 'receipt' && receipt.charges.some(row => row.amount === '250.000' && row.quantity === '2' && row.unitPrice === '125.000');
    result.allOriginalTextRetained = scan.analysis.pages.every(page => page.pdfText?.includes('KHÔNG DÙNG ĐỂ ĐIỀU TRỊ'));
    if (!result.pdfTables || !result.allOriginalTextRetained) throw new Error('pdf_layout_or_source_missing');
  }
  result.noEmptyExtractedFields = scan.analysis.pages[0].fields.every(row => [row.value, row.unit, row.reference].some(value => value.trim()));
  if (!result.noEmptyExtractedFields) throw new Error('empty_model_fields');
  console.log('Synthetic document uploaded and recognized through the live worker.');
  await page.getByText('Đã đọc · cần đối chiếu', { exact: true }).waitFor();
  if (ruledPdf) {
    const overview = page.getByRole('region', { name: 'Tổng quan tài liệu' });
    await overview.getByText('Thông tin chính trên các trang', { exact: true }).click();
    await overview.getByRole('button', { name: /Đối chiếu Họ.*trang 2/ }).first().click();
    const target = page.locator('.document-page:not([hidden]) .document-row[open]').first();
    if (!(await target.locator('summary').evaluate(node => node === document.activeElement))) throw new Error('source_jump_focus');
    await page.getByRole('button', { name: /Xem toàn màn hình/ }).click();
    const viewer = page.getByRole('dialog', { name: 'Xem tài liệu hồ sơ' });
    const frame = viewer.locator('iframe');
    await frame.waitFor();
    if (!(await frame.getAttribute('src')).endsWith('#page=2')) throw new Error('pdf_source_wrong_page');
    await viewer.getByRole('button', { name: 'Quay lại hồ sơ', exact: true }).click();
    await viewer.waitFor({ state: 'hidden' });
    result.sourceJumpAndReturn = true;
    await page.getByRole('navigation', { name: 'Chọn trang tài liệu' }).getByRole('button', { name: /Trang 3/ }).click();
  } else {
  await page.getByRole('button', { name: 'Xem bản gốc ngay tại đây' }).click();
  const originalImage = page.getByRole('img', { name: 'Bản gốc tài liệu để đối chiếu' });
  await originalImage.evaluate(node => node.decode());
  await page.getByRole('button', { name: 'Phóng to bản gốc', exact: true }).click();
  if (!(await originalImage.getAttribute('style')).includes('150%')) throw new Error('image_zoom');
  await page.getByRole('button', { name: 'Vừa khung bản gốc' }).click();
  const scrollPanel = page.getByRole('region', { name: /Ảnh tài liệu gốc/ });
  await scrollPanel.focus();
  await page.keyboard.press('ArrowDown');
  result.inlineOriginalZoom = true;
  await page.getByRole('button', { name: 'Thu gọn bản gốc' }).click();
  }
  await page.getByRole('button', { name: 'Chỉ xem mục cần kiểm tra' }).click();
  if (await page.locator('.document-row:not(.needs-review):visible').count()) throw new Error('uncertainty_filter');
  await page.getByRole('button', { name: 'Xem tất cả các mục' }).click();
  result.uncertaintyFilter = true;
  const activePage = page.locator('.document-page:not([hidden])');
  await activePage.getByLabel('Tiêu đề', { exact: true }).fill('Phiếu thu mẫu đã đối chiếu');
  await activePage.getByRole('button', { name: /Thêm khoản thu/ }).click();
  const row = activePage.locator('.document-group').filter({ has: page.getByRole('heading', { name: /Khoản thu và thanh toán/ }) }).locator('details').last();
  await row.locator('summary').click();
  await row.getByLabel('Tên mục / chỉ số', { exact: true }).fill('Khoản mẫu chỉnh tay');
  await row.getByLabel('Thành tiền nguyên văn').fill('0');
  await row.getByLabel('Tiền tệ trên phiếu').fill('VND');
  await page.getByLabel('Tôi đã đối chiếu các trang với bản gốc').check();
  await page.getByRole('button', { name: 'Lưu bản đối chiếu' }).click();
  await page.getByText('Đã lưu bản đối chiếu vào tài liệu này.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Đã xác nhận', { exact: true }).waitFor();
  if (ruledPdf) await page.getByRole('navigation', { name: 'Chọn trang tài liệu' }).getByRole('button', { name: /Trang 3/ }).click();
  if (await activePage.getByLabel('Tiêu đề', { exact: true }).inputValue() !== 'Phiếu thu mẫu đã đối chiếu') throw new Error('edit_not_persisted');
  if (!(await page.getByText('Khoản mẫu chỉnh tay', { exact: true }).isVisible())) throw new Error('added_row_not_persisted');
  result.editAddConfirmReload = true;
  const reloaded = await (await context.request.get(`${origin}${endpoint}`)).json();
  result.independentSourcePersists = reloaded.analysis.pages.every((value, index) => value.ocrText === scan.analysis.pages[index].ocrText
    && value.ocrEngine === scan.analysis.pages[index].ocrEngine && value.pdfText === scan.analysis.pages[index].pdfText);
  if (!result.independentSourcePersists) throw new Error('source_changed_on_confirmation');
  const sourcePage = ruledPdf ? 3 : 1;
  await activePage.getByText(`Chữ đọc từ ảnh · trang ${sourcePage}`, { exact: true }).click();
  const search = activePage.getByRole('searchbox', { name: `Tìm trong chữ đọc từ ảnh trang ${sourcePage}` });
  await search.fill(ruledPdf ? '250.000' : '251.000');
  if (!(await activePage.getByLabel(`Lớp chữ OCR trang ${sourcePage}`, { exact: true }).textContent()).includes(ruledPdf ? '250.000' : '251.000')) throw new Error('ocr_source_search');
  await search.fill('KHONG_CO_TRONG_TAI_LIEU');
  await activePage.getByText('Không tìm thấy trong lớp chữ này. Kiểm tra thêm bản gốc.', { exact: true }).waitFor();
  await search.fill('');
  if (await activePage.getByLabel(`Lớp chữ OCR trang ${sourcePage}`, { exact: true }).textContent() !== scan.analysis.pages[sourcePage - 1].ocrText) throw new Error('ocr_source_not_fully_visible');
  result.sourceSearchAndFullText = true;
  const stale = await jsonRequest(endpoint, 'PATCH', { revision: scan.revision, analysis: scan.analysis, confirmed: true });
  if (stale.status() !== 409) throw new Error('stale_revision_not_blocked');
  result.staleRevisionBlocked = true;
  const original = await context.request.get(`${origin}/api/pregnancy/documents/${documentId}`);
  if (original.status() !== 200 || !(await original.body()).equals(bytes)) throw new Error('original_changed');
  result.originalUnchanged = true;
  if (ruledPdf) {
    const overview = page.getByRole('region', { name: 'Tổng quan tài liệu' });
    await overview.getByText('Thông tin chính trên các trang', { exact: true }).click();
    const comparison = overview.locator('.document-overview-differences > summary');
    if (await comparison.count()) await comparison.click();
  }
  for (const width of [375, 393, 430, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
      small: [...document.querySelectorAll('.document-review button,.document-review a,.document-review summary,.document-review input:not([type=checkbox]),.document-review select')]
        .some(node => { const r = node.getBoundingClientRect(); return r.height > 0 && r.height < 43; }) }));
    if (metrics.overflow || metrics.small) throw new Error(`layout_${width}`);
    result.widths.push(width);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await search.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'live-ocr-source-iphone.png') });
  await page.getByRole('heading', { name: 'Đọc & đối chiếu', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, ruledPdf ? 'live-pdf-overview-iphone.png' : 'live-review-iphone.png'), fullPage: true });
  if (importRouting) {
    const current = await (await context.request.get(`${origin}${endpoint}`)).json();
    const reviewed = { version: 1, pages: current.analysis.pages.map(({ pdfText, ocrText, ocrEngine, ...value }) => value) };
    for (const item of reviewed.pages.flatMap(value => value.fields)) {
      if (/^Ngày (khám|xét nghiệm|lập|thu|kê đơn)$/.test(item.label) && /^0?8\/0?9\/2026$/.test(item.value)) item.unclear = false;
    }
    // Explicit synthetic manual appointment exercises routing, not OCR accuracy.
    reviewed.pages[0].fields.push({ label: 'Ngày tái khám', value: '09/09/2026 09:30', unit: '', reference: '', evidence: 'SYNTHETIC MANUAL APPOINTMENT; NOT PRINTED ON PDF', unclear: false });
    const prepared = await jsonRequest(endpoint, 'PATCH', { revision: current.revision, analysis: reviewed, confirmed: true });
    if (prepared.status() !== 200) throw new Error('routing_prepare');
    await page.reload({ waitUntil: 'domcontentloaded' });
    const importer = page.locator('.document-import');
    await importer.getByText('Lịch tái khám từ tài liệu', { exact: true }).click();
    const appointment = importer.getByLabel('Ngày và giờ hẹn đã đối chiếu');
    if (await appointment.inputValue() !== '2026-09-09T09:30') throw new Error('followup_not_proposed');
    await importer.getByText('Kiểm tra ngày, cơ sở và lần khám', { exact: true }).click();
    await importer.getByLabel('Ngày khám / ngày trên giấy', { exact: true }).fill('2026-09-08');
    await importer.getByLabel('Liên kết lần khám', { exact: true }).selectOption('');
    // This fixture must never be linked to an existing real family record.
    const importRequest = page.waitForRequest(request => request.url().endsWith(`/documents/${documentId}/import`) && request.method() === 'POST');
    await importer.getByLabel(/Đây là giấy tờ của Mẹ Ngân/).check();
    await importer.getByRole('button', { name: 'Xác nhận & thêm vào hồ sơ' }).click();
    const payload = (await importRequest).postDataJSON();
    await page.getByText('Đã thêm dữ liệu vào hồ sơ', { exact: true }).waitFor();
    const importPath = `/api/pregnancy/documents/${documentId}/import`;
    const again = await jsonRequest(importPath, 'POST', payload);
    if (again.status() !== 200) throw new Error('import_not_idempotent');
    const changed = await jsonRequest(importPath, 'POST', { ...payload, details: { ...payload.details, clinician: 'DIFFERENT SYNTHETIC VALUE' } });
    if (changed.status() !== 409) throw new Error('import_rewrite_not_blocked');
    const snapshot = await (await context.request.get(`${origin}${importPath}?view=imported`)).json();
    if (snapshot.recordId !== recordId || !isDeepStrictEqual(snapshot.analysis, payload.analysis)) throw new Error('import_snapshot_mismatch');
    const savedRecords = await (await context.request.get(`${origin}/api/pregnancy/records`)).json();
    const ownRecord = savedRecords.records.find(record => record.id === recordId);
    if (!ownRecord || new Date(ownRecord.nextAppointmentAt).toISOString() !== '2026-09-09T02:30:00.000Z' || ownRecord.notes !== 'SYNTHETIC TEST; NOT FAMILY MEDICAL DATA') throw new Error('followup_or_notes_not_preserved');
    const tasks = await (await context.request.get(`${origin}/api/tasks?from=2026-09-09&to=2026-09-09`)).json();
    const ownTasks = tasks.tasks.filter(task => task.title === `Lịch tái khám: ${ownRecord.title}`);
    if (ownTasks.length !== 1 || ownTasks[0].dueTime !== '09:30') throw new Error('followup_task_missing_or_duplicate');
    result.importCalendarAndIdempotency = true;
    // A newer draft must not silently rewrite the data already imported.
    const importedScan = await (await context.request.get(`${origin}${endpoint}`)).json();
    const later = structuredClone(payload.analysis); later.pages[0].title = 'LATER SYNTHETIC DRAFT';
    if ((await jsonRequest(endpoint, 'PATCH', { revision: importedScan.revision, analysis: later, confirmed: true })).status() !== 200) throw new Error('later_draft_save');
    const stable = await (await context.request.get(`${origin}${importPath}?view=imported`)).json();
    if (!isDeepStrictEqual(stable.analysis, snapshot.analysis)) throw new Error('import_snapshot_changed');
    result.immutableImportedRevision = true;
    await page.goto(`${origin}/me-bau/ho-so#record-${recordId}`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator(`#record-${recordId} .medical-data`);
    await panel.getByRole('button', { name: 'Xem thông tin đã phân loại' }).click();
    const search = panel.getByRole('searchbox', { name: 'Tìm trong tài liệu' });
    await search.fill('250.000');
    await panel.getByRole('button', { name: 'Trang 3', exact: true }).first().click();
    const viewer = page.getByRole('dialog', { name: 'Xem tài liệu hồ sơ' });
    if (!(await viewer.locator('iframe').getAttribute('src')).endsWith('#page=3')) throw new Error('import_wrong_source_page');
    await viewer.getByRole('button', { name: 'Quay lại hồ sơ', exact: true }).click();
    await search.fill('');
    for (const width of [375, 393, 430, 412, 768, 1280]) {
      await page.setViewportSize({ width, height: 852 });
      const metrics = await panel.evaluate(node => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
        small: [...node.querySelectorAll('button,a,summary,input')].some(el => { const r = el.getBoundingClientRect(); return r.height > 0 && (r.height < 43 || r.width < 43); }) }));
      if (metrics.overflow || metrics.small) throw new Error(`import_layout_${width}`);
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await search.fill('Glucose'); await search.focus(); await page.keyboard.press('Tab');
    if (!(await page.locator(':focus').evaluate(node => node.tagName === 'SUMMARY'))) throw new Error('import_keyboard_focus');
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, 'live-imported-data-iphone.png') });
    result.categorizedDataMobileAndSource = true;
  }
  result.status = 'passed';
} catch (error) {
  // Playwright request errors can contain cookies; never print their stack or call log.
  result.status = 'failed'; result.error = String(error.message).split('\n')[0];
  process.exitCode = 1;
} finally {
  try {
    if (created) {
      const deleted = await jsonRequest(`/api/pregnancy/records/${recordId}`, 'DELETE');
      result.syntheticRecordSoftDeleted = deleted.status() === 200;
      const gone = await context.request.get(`${origin}/api/pregnancy/documents/${documentId}/scan`);
      result.deletedRecordBlocked = gone.status() === 404;
    }
  } catch { result.syntheticRecordSoftDeleted = false; }
  try {
    if (loggedIn) {
      const logout = await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 });
      result.ownSessionRevoked = logout.status() === 303;
    }
  } catch { result.ownSessionRevoked = false; }
  if ((created && !result.syntheticRecordSoftDeleted) || (loggedIn && !result.ownSessionRevoked)) {
    result.status = 'cleanup_needed'; process.exitCode = 1;
  }
  await writeFile(resolve(output, 'live-result.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify(result));
