const { test, expect } = require('@playwright/test');

test('diagnostics persist across reload without changing launcher navigation or making TV calls in preview', async ({ page }) => {
  const errors = [], serviceRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => {
    serviceRequests.push(route.request().url()); return route.fulfill({ body: '{}' });
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/AeroTizen/);
  await expect(page.locator('#grid > .tile').first()).toBeVisible();
  const first = await page.evaluate(() => AeroDiagnostics.snapshot().records.find(item => item.event === 'ui.start').id);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#grid > .tile.focused')).toHaveCount(1);
  await page.evaluate(() => AeroTizen.settingsUi.open());
  await expect(page.locator('#editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor')).toBeHidden();
  await page.reload();
  await expect(page.locator('#grid > .tile').first()).toBeVisible();
  expect(await page.evaluate(id => AeroDiagnostics.snapshot().records.some(item => item.id === id), first)).toBe(true);
  expect(await page.evaluate(() => AeroDiagnostics.snapshot().records.filter(item => item.event === 'ui.start').length)).toBe(2);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(serviceRequests).toEqual([]); expect(errors).toEqual([]);
});

test('cold-start UI events reach a late service without leaving the launcher', async ({ page }) => {
  const errors = [], delivered = [];
  let readyAt;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ body: '{}' });
    if (!readyAt) readyAt = Date.now() + 1800;
    if (Date.now() < readyAt) return route.fulfill({ status: 503, body: '{}' });
    const batch = route.request().postDataJSON(); delivered.push(...batch);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ schema_version: 1, accepted: batch.length }) });
  });
  await page.addInitScript(() => {
    window.tizen = {
      ApplicationControl: function (operation) { this.operation = operation; },
      application: {
        getAppsInfo: done => done([{ id: 'test.app', name: 'Test app', packageId: '1234567890' }]),
        getAppInfo: () => ({ version: '2.4.0' }), launchAppControl() {}
      },
      systeminfo: { getPropertyValue(name, done, fail) { fail?.(); }, addPropertyValueChangeListener() {} }
    };
  });
  await page.goto('/');
  await expect(page.locator('#grid > .tile').first()).toBeVisible();
  await expect.poll(() => delivered.some(item => item.event === 'ui.loaded'), { timeout: 8000 }).toBe(true);
  expect(delivered.some(item => item.event === 'ui.start')).toBe(true);
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  expect(errors).toEqual([]);
});
