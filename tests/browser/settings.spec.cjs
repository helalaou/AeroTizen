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

test('compiled Settings escape waits for /leave before launching native Samsung Home by remote', async ({ page }) => {
  await page.addInitScript(() => {
    window.nativeLaunches = [];
    window.tizen = {
      ApplicationControl: function (operation) { this.operation = operation; },
      application: {
        getAppsInfo: done => done([{ id: 'test.app', name: 'Test app', packageId: '1234567890' }]),
        launch(id, done) { window.nativeLaunches.push(id); done?.(); },
        launchAppControl() {}
      },
      systeminfo: { getPropertyValue(name, done, fail) { fail?.(); }, addPropertyValueChangeListener() {} }
    };
  });
  let acknowledge;
  await page.route('http://127.0.0.1:47790/leave', route => new Promise(resolve => {
    acknowledge = async () => { await route.fulfill({ status: 200, body: '{}' }); resolve(); };
  }));
  await openSettings(page);
  const escape = page.getByRole('button', { name: 'Use Samsung Home instead', exact: true });
  await escape.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => typeof acknowledge).toBe('function');
  expect(await page.evaluate(() => window.nativeLaunches)).toEqual([]);
  await acknowledge();
  await expect.poll(() => page.evaluate(() => window.nativeLaunches)).toEqual(['com.samsung.tv.csfs']);
  expect(await page.evaluate(() => AeroTizen.homewatch.isLeaving())).toBe(false);
});

test('compiled Settings retains the original Samsung Home escape without the optional native module', async ({ page }) => {
  await openSettings(page);
  await page.evaluate(() => {
    delete AeroTizen.homewatch.openSamsungHome;
    window.legacyEscapes = 0;
    AeroTizen.homewatch.useSamsungHome = () => { window.legacyEscapes++; };
  });
  await page.getByRole('button', { name: 'Use Samsung Home instead', exact: true }).click();
  expect(await page.evaluate(() => window.legacyEscapes)).toBe(1);
});

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
  await page.keyboard.press('Enter');
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

test('weather wallpapers are opt-in, use hidden-header weather, persist and restore the selected background', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T12:00Z'));
  const images = [];
  page.on('request', request => { if (request.url().includes('/assets/weather/') && request.url().endsWith('.jpg')) images.push(request.url()); });
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    current: { temperature_2m: 20, weather_code: 0, is_day: 1 },
    daily: { sunrise: ['2026-10-28T06:00'], sunset: ['2026-10-28T18:00'] }
  }) }));
  await openSettings(page);
  const control = page.getByRole('group', { name: 'Dynamic weather wallpapers', exact: true });
  await expect(control.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(images).toEqual([]);
  await page.evaluate(() => {
    Object.assign(AeroTizen.settings, { background: 'snow', speed: 1.3, showWeather: false,
      weatherLocation: { name: 'Fixture city', latitude: 1, longitude: 2 } });
    AeroTizen.settings.save(); AeroTizen.applyBackground(); Weather.updateVisibility();
  });
  await control.getByRole('button', { name: 'Automatic (weather)', exact: true }).click();
  await expect(page.locator('#weather-photo')).toBeVisible();
  await expect(page.locator('#weather')).toBeHidden();
  await expect(page.locator('#bg')).toBeHidden();
  expect(images).toHaveLength(1); expect(images[0]).toContain('/sun.jpg');
  await page.evaluate(() => Backgrounds.setSpeed(1.3));
  await expect(page.locator('#bg')).toBeHidden();
  expect(await page.locator('#bg canvas').count()).toBe(0);
  await page.reload();
  await page.waitForFunction(() => AeroTizen.settings.weatherPhoto === true);
  await expect(page.locator('#weather-photo')).toBeVisible();
  await page.evaluate(() => AeroTizen.settingsUi.open());
  await control.getByRole('button', { name: 'Off', exact: true }).click();
  await expect(page.locator('#weather-photo')).toBeHidden();
  await expect(page.locator('#bg')).toBeVisible();
  expect(await page.evaluate(() => ({ background: AeroTizen.settings.background, speed: AeroTizen.settings.speed })))
    .toEqual({ background: 'snow', speed: 1.3 });
  await expect(page.locator('#bg canvas')).toHaveCount(1);
});

test('turning weather wallpaper off while its image is pending cannot hide the fallback', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T12:00Z'));
  let release;
  await page.route('**/assets/weather/sun.jpg', route => new Promise(resolve => {
    release = async () => { await route.continue(); resolve(); };
  }));
  await openSettings(page);
  await page.evaluate(() => { Weather.currentReading = () => ({ code: 0, day: 1, at: Date.now(), solar: [{sunrise: Date.parse('2026-10-28T06:00Z'), sunset: Date.parse('2026-10-28T18:00Z')}] }); });
  const control = page.getByRole('group', { name: 'Dynamic weather wallpapers', exact: true });
  await control.getByRole('button', { name: 'Automatic (weather)', exact: true }).click();
  await expect.poll(() => typeof release).toBe('function');
  await control.getByRole('button', { name: 'Off', exact: true }).click();
  await release();
  await expect(page.locator('#weather-photo')).toBeHidden();
  await expect(page.locator('#bg')).toBeVisible();
});

test('enabling compiled Settings at 23:00 repairs legacy solar cache once and never requests a daytime image', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T23:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('aerotizen.weather.v2', JSON.stringify({temp:12, code:0, day:1,
      at:Date.parse('2026-10-28T22:55Z'), unit:'C', source:'auto', city:'Fixture city'}));
    localStorage.setItem('aerotizen.settings.v1', JSON.stringify({showWeather:true, weatherPhoto:false, tempUnit:'C'}));
  });
  let release, forecasts = 0, locations = 0;
  const images = [];
  page.on('request', request => { if (/\/assets\/weather\/.*\.jpg$/.test(request.url())) images.push(request.url()); });
  await page.route('https://ipapi.co/**', route => {
    locations++;
    return route.fulfill({contentType:'application/json',body:JSON.stringify({city:'Fixture city', latitude:1, longitude:2})});
  });
  await page.route('https://api.open-meteo.com/**', route => new Promise(resolve => {
    forecasts++;
    release = async () => {
      await route.fulfill({contentType:'application/json',body:JSON.stringify({
        current:{temperature_2m:15,weather_code:0,is_day:0},
        daily:{sunrise:['2026-10-28T06:00'],sunset:['2026-10-28T18:00']}
      })});resolve();
    };
  }));
  await openSettings(page);
  expect(forecasts).toBe(0);expect(locations).toBe(0);
  const group = page.getByRole('group',{name:'Dynamic weather wallpapers',exact:true});
  await group.getByRole('button',{name:'Automatic (weather)',exact:true}).click();
  await expect.poll(() => typeof release).toBe('function');
  await expect(page.locator('#weather-photo')).toBeHidden();
  await expect(page.locator('#bg')).toBeVisible();
  expect(images).toEqual([]);
  for(let i=0;i<3;i++) {
    await group.getByRole('button',{name:'Off',exact:true}).click();
    await group.getByRole('button',{name:'Automatic (weather)',exact:true}).click();
  }
  expect(forecasts).toBe(1);expect(locations).toBe(1);
  await release();
  await expect(page.locator('#weather-photo')).toHaveClass(/scene-night/);
  expect(images).toHaveLength(1);expect(images[0]).toContain('/night.jpg');
  await expect(page.locator('#weather b')).toHaveText('15°');
});
