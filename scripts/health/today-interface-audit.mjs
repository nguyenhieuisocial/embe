// Production UI, read-only family data. Medication writes below are local fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'https://embe.hieu.asia', output = 'data/today-redesign-after';
await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: 'C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe'});
const context = await browser.newContext({viewport: {width: 375, height: 852}, reducedMotion: 'reduce'});
await context.addInitScript(() => {
  localStorage.setItem('embe:device-role', 'mother');
  localStorage.setItem('embe:access-guide-dismissed-at', String(Date.now()));
});
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
let fixture = false, failSave = false, failLoad = false, writes = 0, intakeDay = '';
const plan = {id: '11111111-1111-4111-8111-111111111111', name: 'Thuốc mẫu kiểm tra giao diện', dose_display: 'Liều mẫu',
  instructions: 'Lời dặn mẫu, không phải chỉ định cho gia đình', active: true, times_per_day: 2, reminder_times: ['08:00:00', '20:00:00'],
  confirmed_by_clinician: false, entry_source: 'clinician_plan', dose_states: []};
const geometry = () => page.evaluate(() => {
  const visible = el => {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden],.sr-only,[aria-hidden="true"]')) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.matches('details:not([open])') && !p.querySelector(':scope > summary')?.contains(el)) return false;
    }
    return true;
  };
  const controls = [...document.querySelectorAll('main a,main button,main summary')].filter(visible);
  return {overflow: document.documentElement.scrollWidth > innerWidth + 1, height: document.documentElement.scrollHeight,
    smallTargets: controls.filter(el => { const r = el.getBoundingClientRect(); return r.width < 43 || r.height < 43; }).map(el => ({class: el.className, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height})),
    doses: document.querySelectorAll('.today-medication').length, doseControls: document.querySelectorAll('.today-medication-check').length,
    expanded: document.querySelectorAll('.today-medications details[open]').length};
});
try {
  const version = (await (await context.request.get(origin + '/api/health')).json()).version;
  if (process.env.EMBE_AUDIT_EXPECTED_VERSION) assert.equal(version, process.env.EMBE_AUDIT_EXPECTED_VERSION);
  await page.goto(origin + '/');
  if (page.url().includes('/login')) {
    await page.getByLabel('Mật khẩu', {exact: true}).fill(process.env.EMBE_VERIFY_PASSWORD);
    await page.getByRole('button', {name: 'Vào sổ gia đình', exact: true}).click();
    await page.waitForURL(origin + '/', {timeout: 45000});
  }
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (fixture && new URL(request.url()).pathname === '/api/pregnancy/care') {
      if (request.method() === 'GET' && failLoad) return route.fulfill({status: 503, json: {error: 'fixture unavailable'}});
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON();
        assert.equal(body.action, 'intake'); assert.equal(body.planId, plan.id); assert.equal(body.status, 'taken');
        assert.equal('confirmedByClinician' in body, false);
        intakeDay = body.day;
        writes++;
        await new Promise(resolve => setTimeout(resolve, 700));
        if (failSave) return route.fulfill({status: 503, json: {error: 'fixture failure'}});
        plan.dose_states = [...plan.dose_states, {slot: body.slot, status: 'taken'}];
      }
      return route.fulfill({json: {snapshot: {plans: [plan]}, ...(plan.dose_states.length === 2
        ? {checklistCompletion: {taskId: 'supplements', day: intakeDay}} : {})}});
    }
    return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort('blockedbyclient');
  });
  for (const width of [375, 430, 768, 1280]) {
    await page.setViewportSize({width, height: 852});
    await page.goto(origin + '/');
    await page.getByRole('heading', {name: 'Việc cần nhớ', exact: true}).waitFor();
    await page.locator('.today-medication,.today-medications-empty,.today-medications [role="alert"]').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const scan = await geometry();
    assert.equal(scan.overflow, false); assert.deepEqual(scan.smallTargets, []); assert.equal(scan.expanded, 0);
    assert.equal(scan.doseControls, scan.doses, 'Every tracked slot has a saved state or action');
    assert.equal(await page.locator('.daily-shortcuts > a').count(), 4);
    await page.screenshot({path: `${output}/home-${width}.png`, fullPage: true});
    results.push({case: 'live layout', width, ...scan});
  }
  for (const width of [375,430,768,1280]) {
    await page.setViewportSize({width, height: 852});
    await page.goto(origin + '/me-bau#viec-hom-nay');
    const board = page.locator('#viec-hom-nay');
    await board.locator('.today-medication,.today-medications-empty,.today-medications [role="alert"]').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await board.getByRole('checkbox', {name: /Thuốc và vi chất theo đúng đơn/}).count(), 0);
    await board.getByRole('progressbar', {name: 'Tiến độ thói quen hôm nay', exact: true}).waitFor();
    const scan = await geometry();
    assert.equal(scan.overflow, false); assert.deepEqual(scan.smallTargets, []);
    assert.equal(scan.doseControls, scan.doses, 'Checklist must not gate existing dose actions');
    await board.screenshot({path: `${output}/checklist-${width}.png`});
    results.push({case: 'live daily checklist with scheduled doses', width, ...scan});
  }
  await page.setViewportSize({width: 375, height: 852}); fixture = true;
  await page.goto(origin + '/');
  const first = page.getByRole('button', {name: 'Đánh dấu đã dùng Thuốc mẫu kiểm tra giao diện lần 1', exact: true});
  await first.waitFor();
  const summary = page.locator('.today-medications summary').first();
  await summary.focus(); await page.keyboard.press('Enter');
  assert.equal(await summary.evaluate(el => el.parentElement.open), true);
  await page.keyboard.press('Enter');
  assert.equal(await summary.evaluate(el => el.parentElement.open), false);
  results.push({case: 'keyboard opens and closes medication guidance', passed: true});
  await first.click();
  assert.match(await first.innerText(), /Đang lưu/);
  assert.equal(await page.locator('span.today-medication-check').count(), 0);
  await page.getByText('Đã ghi Thuốc mẫu kiểm tra giao diện · lần 1 đã dùng.', {exact: true}).waitFor();
  assert.equal(await page.locator('span.today-medication-check').count(), 1);
  assert.equal(writes, 1);
  results.push({case: 'pending then saved only after mocked receipt', passed: true});
  await page.goto(origin + '/me-bau#viec-hom-nay');
  await page.locator('#viec-hom-nay span.today-medication-check').waitFor();
  assert.equal(await page.locator('#viec-hom-nay .today-medication').count(), 2);
  assert.equal(writes, 1);
  results.push({case: 'Home intake is reflected in daily checklist with no second write', passed: true});
  failSave = true;
  await page.getByRole('button', {name: 'Đánh dấu đã dùng Thuốc mẫu kiểm tra giao diện lần 2', exact: true}).click();
  await page.getByText(/Chưa xác nhận được việc lưu/).waitFor();
  assert.equal(await page.locator('span.today-medication-check').count(), 1);
  results.push({case: 'failed save preserves pending dose', passed: true});
  failLoad = true; await page.reload();
  await page.locator('.today-medications [role="alert"]').waitFor();
  assert.equal(await page.locator('.today-medications-empty').count(), 0);
  failLoad = false; await page.locator('.today-medications').getByRole('button', {name: 'Thử lại', exact: true}).click();
  await first.waitFor({state: 'hidden'});
  await page.getByRole('button', {name: 'Đánh dấu đã dùng Thuốc mẫu kiểm tra giao diện lần 2', exact: true}).waitFor();
  results.push({case: 'load failure has retry, not a false empty schedule', passed: true});
  failSave = false;
  await page.getByRole('button', {name: 'Đánh dấu đã dùng Thuốc mẫu kiểm tra giao diện lần 2', exact: true}).click();
  await page.getByText('Đã ghi Thuốc mẫu kiểm tra giao diện · lần 2 đã dùng.', {exact: true}).waitFor();
  assert.ok(await page.evaluate(day => JSON.parse(localStorage.getItem(`embe:pregnancy:checklist:${day}`) || '[]').includes('supplements'), intakeDay));
  await page.goto(origin + '/');
  await page.waitForFunction(() => document.querySelectorAll('span.today-medication-check').length === 2);
  assert.equal(writes, 3);
  results.push({case: 'completed checklist doses appear on Home and emit the linked completion once', passed: true});
  await page.setViewportSize({width: 667, height: 375});
  await page.addStyleTag({content: 'html {font-size: 20px !important}'});
  const enlarged = await geometry();
  assert.equal(enlarged.overflow, false); assert.deepEqual(enlarged.smallTargets, []);
  results.push({case: 'landscape at 125 percent text', ...enlarged});
  await page.evaluate(() => {
    localStorage.setItem('embe:family:birth-occurred-at', new Date().toISOString());
    window.dispatchEvent(new Event('embe:family-stage-change'));
  });
  await page.locator('.daily-shortcuts').getByRole('link', {name: 'Ghi cữ bú', exact: true}).waitFor();
  assert.equal(await page.locator('.today-stage-card').count(), 0);
  results.push({case: 'postpartum switches shortcuts and stage, browser-only fixture', passed: true});
  assert.deepEqual(errors, []);
  await writeFile(`${output}/audit.json`, JSON.stringify({version, results, errors, mockedMedicationWrites: writes, realFamilyWrites: 0}, null, 2));
  console.log(JSON.stringify({checks: results.length, errors: errors.length, mockedMedicationWrites: writes, realFamilyWrites: 0}));
} finally {
  await context.unrouteAll({behavior: 'wait'});
  await context.request.post(origin + '/api/auth/logout', {headers: {origin}, maxRedirects: 0}).catch(() => {});
  await browser.close();
}
