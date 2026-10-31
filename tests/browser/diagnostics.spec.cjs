const { test, expect } = require('@playwright/test');

async function persistedEvents(page) {
  return page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('aerotizen.diagnostics.v1', 1);
    open.onerror = () => resolve([]);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('logs')) { db.close(); resolve([]); return; }
      const transaction = db.transaction('logs', 'readonly'), read = transaction.objectStore('logs').get('current');
      transaction.oncomplete = () => { db.close(); resolve(read.result ? JSON.parse(read.result) : []); };
      transaction.onabort = () => { db.close(); resolve([]); };
    };
  }));
}

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
  await expect.poll(async () => (await persistedEvents(page)).some(item => item.id === first)).toBe(true);
  await page.reload();
  await expect(page.locator('#grid > .tile').first()).toBeVisible();
  await expect.poll(() => page.evaluate(id => AeroDiagnostics.snapshot().records.some(item => item.id === id), first)).toBe(true);
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
    const batch = route.request().postDataJSON().records; delivered.push(...batch);
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


test('legacy UI logs migrate asynchronously without writing the old localStorage key', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.addInitScript(() => {
    localStorage.setItem('aerotizen.diagnostics.v1', JSON.stringify([{ id: 'legacy-1', at: 1, source: 'ui', event: 'ui.loaded', data: {} }]));
    window.legacyWrites = 0;
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'aerotizen.diagnostics.v1') { window.legacyWrites++; throw new Error('Synchronous log write'); }
      return write.call(this, key, value);
    };
  });
  await page.goto('/');
  await expect(page.locator('#grid > .tile').first()).toBeVisible();
  await expect.poll(async () => (await persistedEvents(page)).some(item => item.event === 'ui.loaded')).toBe(true);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aerotizen.diagnostics.v1'))).toBe(null);
  expect(await page.evaluate(() => window.legacyWrites)).toBe(0); expect(errors).toEqual([]);
});

for (const unavailable of [false, true]) {
  test(`remote launch never waits for diagnostic storage (${unavailable ? 'unavailable' : 'IndexedDB'})`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
    await page.route('http://127.0.0.1:47790/**', route => {
      const batch = route.request().method() === 'POST' ? route.request().postDataJSON().records : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ schema_version: 1, accepted: batch.length }) });
    });
    await page.addInitScript(unavailable => {
      window.launches = []; window.inputStorageCalls = 0; window.logWrites = 0;
      localStorage.setItem('aerotizen.settings.v1', JSON.stringify({ home: ['test.app'], showWeather: false, background: 'black' }));
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (this.name === 'aerotizen.diagnostics.v1' && args[1] === 'readwrite') {
          window.logWrites++; if (window.inLaunch) window.inputStorageCalls++;
        }
        return transaction.apply(this, args);
      };
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'aerotizen.diagnostics.v1') { window.inputStorageCalls++; throw new Error('Synchronous log write'); }
        return write.call(this, key, value);
      };
      if (unavailable) Object.defineProperty(window, 'indexedDB', { value: undefined });
      window.tizen = {
        ApplicationControl: function (operation) { this.operation = operation; },
        application: {
          getAppsInfo: done => done([{ id: 'test.app', name: 'Test app', packageId: '1234567890' }]),
          getAppInfo: () => ({ version: '2.4.0' }), launchAppControl() {},
          launch(id) { window.launches.push(id); }
        },
        systeminfo: { getPropertyValue(name, done, fail) { fail?.(); }, addPropertyValueChangeListener() {} }
      };
    }, unavailable);
    await page.goto('/');
    await expect(page.locator('#grid > .tile').first()).toBeVisible();
    await page.evaluate(() => {
      const launch = AeroTizen.apps.launch;
      AeroTizen.apps.launch = function (app) {
        window.inLaunch = true;
        try { return launch(app); } finally { window.inLaunch = false; }
      };
    });
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.launches)).toEqual(['test.app']);
    expect(await page.evaluate(() => AeroDiagnostics.snapshot().records.some(item => item.event === 'app.launch_requested'))).toBe(true);
    expect(await page.evaluate(() => window.inputStorageCalls)).toBe(0);
    if (!unavailable) await expect.poll(() => page.evaluate(() => window.logWrites)).toBeGreaterThan(0);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  });
}


test('personal text is excluded before IndexedDB persistence and loopback delivery', async ({ page }) => {
  const delivered = [];
  const poison = 'Alex Example alex@example.invalid 2001:db8::7 My Private Film PRIVATE-CREDENTIAL';
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ body: '{}' });
    const packet = route.request().postDataJSON(); delivered.push(packet);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ schema_version: 1, accepted: packet.records.length }) });
  });
  await page.addInitScript(poison => {
    localStorage.setItem('aerotizen.diagnostics.v1', JSON.stringify([{ id: 'private-person', at: 1, source: 'ui', event: 'ui.error', data: { message: poison, app_id: poison } }]));
    window.tizen = {
      ApplicationControl: function (operation) { this.operation = operation; },
      application: { getAppsInfo: done => done([{ id: 'test.app', name: 'Test app', packageId: '1234567890' }]),
        getAppInfo: () => ({ version: '2.4.0' }), launchAppControl() {} },
      systeminfo: { getPropertyValue(name, done, fail) { fail?.(); }, addPropertyValueChangeListener() {} }
    };
  }, poison);
  await page.goto('/');
  await expect(page.locator('#grid > .tile').first()).toBeVisible();
  await page.evaluate(poison => {
    AeroBuildInfo.owner = poison;
    AeroDiagnostics.record('app.launch_requested', { app_id: poison, message: poison, payload: poison });
    window.dispatchEvent(new ErrorEvent('error', { error: new Error(poison), filename: 'file:///opt/' + poison + '.js', lineno: 9 }));
    AeroDiagnostics.flush();
  }, poison);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#grid > .tile.focused')).toHaveCount(1);
  await expect.poll(async () => (await persistedEvents(page)).some(item => item.event === 'app.launch_requested')).toBe(true);
  await expect.poll(() => delivered.some(packet => packet.records.some(item => item.event === 'app.launch_requested'))).toBe(true);
  const raw = JSON.stringify({ saved: await persistedEvents(page), uploads: delivered,
    memory: await page.evaluate(() => AeroDiagnostics.snapshot()) });
  for (const value of poison.split(' ').concat(['private-person'])) expect(raw).not.toContain(value);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aerotizen.diagnostics.v1'))).toBe(null);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
