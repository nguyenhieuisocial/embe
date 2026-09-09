import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia';
const output = 'data/interface-interactions';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
await context.addInitScript(() => { localStorage.setItem('embe:device-role', 'mother'); localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now())); });
const page = await context.newPage();
const results = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const plan = { id: '11111111-1111-4111-8111-111111111111', category: 'medicine', name: 'Thuốc mẫu kiểm tra giao diện',
  dose_display: 'Theo đơn mẫu', instructions: 'Dữ liệu thử, không phải thuốc của gia đình', active: true, times_per_day: 1,
  reminder_times: ['08:00:00'], confirmed_by_clinician: true, entry_source: 'clinician_plan', nutrient_amounts: {}, taken_slots: [], dose_states: [] };
const snapshot = { plans: [plan], profile: null, iphone_devices: [], iphone_health: null, iphone_health_history: [] };
let failSave = false, failLoad = false, writes = 0;
try {
  await page.goto(origin + '/me-bau');
  if (page.url().includes('/login')) {
    await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.EMBE_VERIFY_PASSWORD);
    await page.getByRole('button', { name: 'Vào sổ gia đình', exact: true }).click();
    await page.waitForURL(origin + '/me-bau', { timeout: 45000 });
  }
  // All writes after login are intercepted. No test data reaches the family store.
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/pregnancy/care') {
      if (failLoad && request.method() === 'GET') return route.fulfill({ status: 503, json: { error: 'fixture unavailable' } });
      if (!['GET', 'HEAD'].includes(request.method())) {
        writes++;
        assert.equal(request.postDataJSON().action, 'intake');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (failSave) return route.fulfill({ status: 503, json: { error: 'fixture failure' } });
        plan.dose_states = [{ slot: 1, status: 'taken' }]; plan.taken_slots = [1];
      }
      return route.fulfill({ json: { snapshot } });
    }
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(origin + '/me-bau/thuoc');
  await page.getByRole('heading', { level: 1, name: 'Thuốc & vi chất' }).waitFor();
  const takenButton = page.getByRole('button', { name: 'Đánh dấu đã uống Thuốc mẫu kiểm tra giao diện lần 1', exact: true });
  await takenButton.waitFor();
  await takenButton.click();
  assert.match(await takenButton.innerText(), /Đang lưu/);
  await page.getByText('✓ Đã uống', { exact: true }).waitFor();
  assert.equal(writes, 1);
  results.push('Medication pending → saved only after mocked receipt');

  plan.dose_states = []; plan.taken_slots = []; failSave = true;
  await page.reload();
  await takenButton.click();
  await page.waitForFunction(() => !document.querySelector('.dose-taken-button')?.disabled);
  assert.equal(await page.getByText('✓ Đã uống', { exact: true }).count(), 0);
  assert.equal(await takenButton.count(), 1);
  results.push('Failed medication write does not display taken');

  failLoad = true;
  await page.reload();
  await page.getByText('Chưa tải được thuốc', { exact: true }).waitFor();
  assert.equal(await page.getByText('Chưa có lịch dùng hằng ngày', { exact: true }).count(), 0);
  failLoad = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await takenButton.waitFor();
  results.push('Unavailable medication data shows retry, not a false empty state');

  await page.locator('details.care-medication-manage').first().locator('summary').click();
  await page.getByRole('button', { name: '+ Thêm thuốc hoặc vi chất', exact: true }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Bản nháp kiểm tra');
  await page.getByRole('button', { name: 'Sức khỏe iPhone', exact: true }).click();
  await page.getByRole('button', { name: 'Thuốc & vi chất', exact: true }).click();
  assert.equal(await page.getByLabel('Tên', { exact: true }).inputValue(), 'Bản nháp kiểm tra');
  await page.screenshot({ path: output + '/medication-form-375.png', fullPage: true });
  results.push('Medication draft survives tab switching');

  await page.goto(origin + '/me-bau/ho-so');
  await page.getByRole('button', { name: 'Tự nhập', exact: true }).click();
  for (const width of [375, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    const invalid = await page.locator('.medical-form input[type="datetime-local"]').evaluateAll(elements => elements.filter(e => {
      const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth || b.left < 0 || b.height < 44 || Number.parseFloat(getComputedStyle(e).fontSize) < 16);
    }).length);
    assert.equal(invalid, 0, 'Native date fields must fit and remain readable at ' + width);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('.medical-form input').first().focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.matches('input,select,textarea,button,summary')), true);
  await page.screenshot({ path: output + '/medical-form-375.png', fullPage: true });
  results.push('Medical date inputs fit 375/430/768/1280; keyboard focus usable');

  await page.goto(origin + '/me-bau/bua-an');
  const note = page.getByLabel('Ghi chú món ăn · có thể lưu không cần ảnh');
  await note.fill('Bản nháp thử giao diện — không lưu');
  await page.getByRole('button', { name: /^Đã ăn/ }).click();
  await page.getByRole('button', { name: 'Ghi bữa', exact: true }).click();
  assert.equal(await note.inputValue(), 'Bản nháp thử giao diện — không lưu');
  results.push('Meal draft survives history switching');

  await page.goto(origin + '/ghi-lai');
  assert.equal(await page.getByRole('radio').count(), 0);
  await page.getByLabel('Điều đáng nhớ', { exact: true }).fill('Bản nháp đổi người ghi — không lưu');
  await page.getByRole('button', { name: 'Đổi người ghi', exact: true }).click();
  await page.locator('.author-choice label').filter({ hasText: 'Ba Hiếu' }).click();
  assert.equal(await page.getByRole('radio', { name: 'Ba Hiếu', exact: true }).isChecked(), true);
  await page.getByRole('button', { name: 'Xong người ghi', exact: true }).click();
  assert.equal(await page.getByRole('radio').count(), 0);
  assert.equal(await page.getByLabel('Điều đáng nhớ', { exact: true }).inputValue(), 'Bản nháp đổi người ghi — không lưu');
  results.push('Known journal author stays compact; changing author preserves draft');

  await page.goto(origin + '/me-bau');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('is-dock-hidden'));
  await page.mouse.wheel(0, -220);
  await page.waitForFunction(() => !document.querySelector('.app-shell')?.classList.contains('is-dock-hidden'));
  const dock = await page.locator('.family-nav').boundingBox();
  assert.ok(dock && dock.y >= 0 && dock.y + dock.height <= 814);
  results.push('Navigation hides down, returns up and stays within the mobile viewport');

  await page.setViewportSize({ width: 812, height: 375 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addStyleTag({ content: 'html { font-size: 125% !important; }' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  results.push('Maternal hub fits landscape and 125% text scale with reduced motion');

  await page.goto(origin + '/ky-niem?view=album');
  const covers = page.locator('.memory-album-covers img');
  const coverCount = await covers.count();
  assert.ok(coverCount > 0);
  for (let index = 0; index < coverCount; index++) {
    await covers.nth(index).scrollIntoViewIfNeeded();
    await covers.nth(index).evaluate(image => new Promise((resolve, reject) => {
      const limit = setTimeout(() => reject(new Error('Album cover did not load')), 15000);
      const loaded = () => { clearTimeout(limit); image.naturalWidth > 0 ? resolve(true) : reject(new Error('Album cover failed')); };
      if (image.complete && image.currentSrc) loaded();
      else { image.addEventListener('load', loaded, { once: true }); image.addEventListener('error', loaded, { once: true }); }
    }));
  }
  results.push('Every album cover loads when scrolled into view');
  await page.locator('.memory-album').first().click();
  await page.locator('.memory-album-grid button').first().click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('+');
  await page.locator('.photo-viewer-stage.is-zoomed').waitFor();
  await page.keyboard.press('0');
  assert.equal(await page.locator('.photo-viewer-stage.is-zoomed').count(), 0);
  await page.getByRole('button', { name: 'Đóng ảnh', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('.memory-album-grid button').first().evaluate(button => document.activeElement === button), true);
  results.push('Album viewer zoom/reset/close works and restores focus to the photo');
  assert.deepEqual(errors, []);
  await writeFile(output + '/result.json', JSON.stringify({ results, writesMocked: writes, pageErrors: errors, browser: 'Cent', physicalIphone: false }, null, 2));
  console.log(JSON.stringify({ passed: results.length, writesMocked: writes, errors }));
} finally {
  await context.unrouteAll({ behavior: 'wait' });
  await context.request.post(origin + '/api/auth/logout', { headers: { origin }, maxRedirects: 0 }).catch(() => {});
  await browser.close();
}
