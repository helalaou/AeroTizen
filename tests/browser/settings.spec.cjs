const { test, expect } = require('@playwright/test');
const { runSettingsUi } = require('../settings_ui.browser');
const { runSettingsFocus } = require('../settings_focus.browser');
const { runSettingsResources } = require('../settings_resources.browser');

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) messages.push(message.text());
  });
  // All weather lookups are fixtures; no entered location leaves the test.
  await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

const openSettings = async (page, waitForApps = true) => {
  await page.goto('/');
  await page.waitForFunction(() => window.AeroTizen?.settingsUi && Array.isArray(AeroTizen.settings.home));
  if (waitForApps) await page.waitForFunction(() => AeroTizen.apps.all.length > 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    Object.assign(AeroTizen.settings, { background: 'black', timeFormat: '24', showTime: true });
    AeroTizen.settings.save(); AeroTizen.settingsUi.open();
  });
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('[data-key="bg:black"]')).toHaveClass(/focused/);
};

test('Settings matches legacy remote, persistence, search and artwork behaviour', async ({ page }, info) => {
  await page.goto('/');
  const result = await runSettingsUi(page, { baselineUrl: 'http://127.0.0.1:8170',
    screenshotPath: variant => info.outputPath(variant + '.png') });
  expect(result.runtimeErrors).toEqual([]);
});

test('native remote keys preserve navigation, text entry and close behaviour', async ({ page }) => {
  await page.goto('/');
  expect(await runSettingsFocus(page)).toEqual({ nativeArrows: true, nativeImeDone: true, renderedFocus: true, nativeClose: true });
});

test('pending image retries and stale callbacks are cleaned up', async ({ page }) => {
  await page.goto('/');
  expect(await runSettingsResources(page)).toEqual({ pendingCleanup: true, staleImageIgnored: true,
    timeoutRetry: true, exhaustedFallback: true });
});

test('failed artwork retries from the first candidate on reopen while loaded artwork stays cached', async ({ page }) => {
  let recovered = false, loadedRequests = 0;
  const failedRequests = [];
  await page.route('https://retry-artwork.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/loaded') loadedRequests++;
    else failedRequests.push(path);
    await route.fulfill({ contentType: 'image/svg+xml', headers: { 'cache-control': 'no-store' },
      body: path === '/loaded' || recovered ?
        '<svg xmlns="http://www.w3.org/2000/svg" width="304" height="304"><rect width="304" height="304" fill="purple"/></svg>' : 'invalid image' });
  });
  await page.goto('/');
  await page.waitForFunction(() => AeroTizen.apps.all.length >= 2);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const ids = await page.evaluate(() => {
    const [loaded, failed] = AeroTizen.apps.all.map(app => app.id);
    AeroTizen.artwork.sources = app => app.id === loaded ? ['https://retry-artwork.test/loaded'] :
      app.id === failed ? ['https://retry-artwork.test/failed/first', 'https://retry-artwork.test/failed/second'] : [];
    AeroTizen.settingsUi.open();
    return { loaded, failed };
  });
  const loadedTile = page.locator('[data-key="app:' + ids.loaded + '"]');
  const failedTile = page.locator('[data-key="app:' + ids.failed + '"]');
  await expect(loadedTile).toHaveClass(/has-artwork/);
  await expect.poll(() => failedRequests).toEqual(['/failed/first', '/failed/second']);
  await expect(failedTile.locator('.app-artwork')).toHaveCount(0);
  await expect(failedTile.locator('.app-fallback')).toBeVisible();
  const loadedNode = await loadedTile.locator('.app-artwork').elementHandle();
  recovered = true;
  await page.evaluate(() => { AeroTizen.settingsUi.close(); AeroTizen.settingsUi.open(); });
  await expect(failedTile).toHaveClass(/has-artwork/);
  expect(failedRequests).toEqual(['/failed/first', '/failed/second', '/failed/first']);
  expect(loadedRequests).toBe(1);
  expect(await loadedNode.evaluate(node => node === document.querySelector('[data-key="app:' +
    AeroTizen.apps.all[0].id + '"] .app-artwork'))).toBe(true);
});

test('the first pointer click activates its control; Space activates buttons without consuming input spaces', async ({ page }) => {
  await openSettings(page);
  const time = page.locator('[data-key="time:12"]');
  await time.click();
  await expect(time).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => AeroTizen.settings.timeFormat)).toBe('12');
  await page.locator('[data-key="bg:lava"]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-key="bg:lava"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-key="preview"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveClass(/previewing/);
  await page.keyboard.press('Space');
  await expect(page.locator('body')).not.toHaveClass(/previewing/);
  const input = page.getByRole('textbox', { name: 'Weather location', exact: true });
  await input.fill('A');
  await page.keyboard.press('Space');
  await expect(input).toHaveValue('A ');
});

test('an unrelated preference does not remeasure navigation; removed controls restore focus', async ({ page }) => {
  await openSettings(page);
  await page.locator('[data-key="time:12"]').click();
  await expect(page.locator('[data-key="time:12"]')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    window.layoutReads = 0;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
    for (const node of document.querySelectorAll('#editor [data-key]')) {
      Object.defineProperty(node, 'offsetTop', { configurable: true, get() { window.layoutReads++; return descriptor.get.call(this); } });
    }
    AeroTizen.settings.timeFormat = '24'; AeroTizen.settings.save();
  });
  await expect(page.locator('[data-key="time:24"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.layoutReads)).toBe(0);
  await page.evaluate(() => { AeroTizen.settings.background = 'aurora'; AeroTizen.settings.save(); });
  await page.locator('[data-key="speed"]').focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => AeroTizen.settings.speed)).toBe(1.25);
  await page.evaluate(() => { AeroTizen.settings.background = 'black'; AeroTizen.settings.save(); });
  await expect(page.locator('[data-key="speed"]')).toHaveCount(0);
  await expect(page.locator('#editor .focused')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('focused'))).toBe(true);
});

test('date previews stay stable during an opening and refresh on the next opening', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-24T12:10:00Z'));
  await openSettings(page);
  const time = page.locator('[data-key="time:24"]');
  const original = await time.textContent();
  await page.clock.setFixedTime(new Date('2026-10-24T13:10:00Z'));
  await page.locator('[data-key="network-visibility:false"]').click();
  await expect(page.locator('[data-key="network-visibility:false"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(time).toHaveText(original);
  await page.evaluate(() => AeroTizen.settingsUi.open());
  await expect(time).toHaveText(original);
  await page.evaluate(() => { AeroTizen.settingsUi.close(); AeroTizen.settingsUi.open(); });
  await expect(time).not.toHaveText(original);
});

test('late TV inventory and hot-plug updates reach Settings without a preference change', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aerotizen.settings.v1', JSON.stringify({ home: [], tempUnit: 'C', timeFormat: '24' }));
    const tv = window.testTv = { apps: [], inputs: [], listeners: {} };
    window.tizen = {
      application: { getAppsInfo: done => tv.apps.push(done), launchAppControl() {} },
      systeminfo: {
        getPropertyValue(name, done, fail) { if (name === 'VIDEOSOURCE') tv.inputs.push(done); else fail?.(); },
        addPropertyValueChangeListener(name, listener) { tv.listeners[name] = listener; }
      }
    };
  });
  await openSettings(page, false);
  await expect(page.locator('#input-names input')).toHaveCount(0);
  const saved = await page.evaluate(() => localStorage.getItem(AeroTizen.config.STORAGE_KEY));
  await page.evaluate(() => testTv.apps.shift()([{ id: 'review-one', name: 'First app', packageId: '1234567890' }]));
  await expect(page.locator('[data-key="app:review-one"]')).toHaveAttribute('aria-label', 'First app');
  await page.evaluate(() => testTv.inputs.shift()({ connected: [{ type: 'HDMI', number: 1, editName: 'Console' }], disconnected: [] }));
  const input = page.getByRole('textbox', { name: 'HDMI 1 name', exact: true });
  await input.fill('Unsaved draft');
  await page.evaluate(() => {
    window.originalInput = document.querySelector('[data-key="name:HDMI 1"] input');
    testTv.listeners.VIDEOSOURCE();
    testTv.inputs.shift()({ connected: [{ type: 'HDMI', number: 1, editName: 'New device' },
      { type: 'HDMI', number: 2, editName: 'PC' }], disconnected: [] });
    AeroTizen.apps.load(() => {});
    testTv.apps.shift()([{ id: 'review-one', name: 'Renamed app', packageId: '1234567890' },
      { id: 'review-two', name: 'Second app', packageId: 'abcdefghij' }]);
  });
  await expect(page.locator('#input-names input')).toHaveCount(2);
  await expect(page.locator('[data-key="app:review-two"]')).toHaveAttribute('aria-label', 'Second app');
  await expect(page.locator('[data-key="app:review-one"]')).toHaveAttribute('aria-label', 'Renamed app');
  await expect(input).toHaveValue('Unsaved draft');
  await expect(input).toHaveAttribute('placeholder', 'New device');
  expect(await page.evaluate(() => document.querySelector('[data-key="name:HDMI 1"] input') === window.originalInput)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem(AeroTizen.config.STORAGE_KEY))).toBe(saved);
});
