const { test, expect } = require('@playwright/test');
const prime = 'org.tizen.primevideo', youtube = '9Ur5IzDKqV.TizenYouTube';

for (const correctClock of [false, true]) {
  test(correctClock ? 'a cold TV clock correction does not cancel startup retries' :
    'a late startup feed appears without reopening AeroTizen or reloading settled cards', async ({ page }) => {
    const reads = { prime: 0, youtube: 0 }, errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date(correctClock ? 7680 : '2026-10-26T20:00:00Z') });
    await page.route('https://**/*', r => r.fulfill({ body: '{}' }));
    await page.route('http://127.0.0.1:47790/**', r => r.fulfill({ body: '{}' }));
    await page.route('http://localhost:9013/**', r => {
      const isPrime = r.request().headers().app_id === '3201910019365';
      const count = ++reads[isPrime ? 'prime' : 'youtube'];
      const records = isPrime && count < 9 ? [] : [{ app_id: isPrime ? '3201910019365' : '111299001912',
        content_id: isPrime ? 'prime-item' : 'youtube-item', content_title: isPrime ? 'Late Prime programme' : 'YouTube programme',
        payload: 'saved-launch-data', timestamp: isPrime ? 1000 : 2000 }];
      return r.fulfill({ status: isPrime && count === 1 ? 503 : 200,
        headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(records) });
    });
    await page.addInitScript(({ prime, youtube, correctClock }) => {
      localStorage.setItem('aerotizen.settings.v1', JSON.stringify({ home: [youtube], showWeather: false,
        background: 'black', continueWatching: true, continueWatchingApps: [prime, youtube] }));
      window.providerLaunches = []; window.completedFeeds = 0;
      const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this.startupFeed = String(url).startsWith('http://localhost:9013/');
        return open.call(this, method, url, ...args);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        if (this.startupFeed) this.addEventListener('loadend', () => { completedFeeds++; });
        return send.apply(this, args);
      };
      window.tizen = { application: {
        getAppsInfo: done => {
          const inventory = [{ id: prime, name: 'Prime Video', packageId: prime },
            { id: youtube, name: 'YouTube', packageId: '9Ur5IzDKqV' }];
          if (correctClock) window.releaseInventory = () => done(inventory); else done(inventory);
        },
        getAppMetaData: () => [{ key: 'http://samsung.com/tv/metadata/app_support_continue_watching', value: 'true' }],
        launchAppControl: (...args) => providerLaunches.push(args)
      } };
    }, { prime, youtube, correctClock });
    await page.goto('/');
    if (correctClock) {
      await page.waitForFunction(() => typeof releaseInventory === 'function');
      await page.clock.fastForward(15445);
      await page.clock.setSystemTime(new Date('2026-10-26T20:00:00Z'));
      await page.evaluate(() => releaseInventory());
    }
    await page.waitForFunction(() => completedFeeds === 2);
    await expect(page.locator('.continue-card')).toHaveCount(1);
    await page.evaluate(() => {
      window.firstCard = document.querySelector('.continue-card');
      window.firstIcon = firstCard.querySelector('.continue-app-icon');
    });
    for (const [index, delay] of [2000, 5000, 15000, 30000, 60000, 60000, 60000, 60000].entries()) {
      await page.clock.fastForward(delay);
      await page.waitForFunction(expected => completedFeeds === expected, index + 3, { timeout: 5000 });
    }
    await expect(page.locator('.continue-card')).toHaveCount(2);
    await expect(page.locator('.continue-card').last()).toContainText('Late Prime programme');
    expect(await page.evaluate(() => firstCard === document.querySelector('.continue-card') &&
      firstIcon === firstCard.querySelector('.continue-app-icon'))).toBe(true);
    await page.clock.fastForward(120000);
    expect(reads).toEqual({ prime: 9, youtube: 1 });
    expect(await page.evaluate(() => providerLaunches)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('settled cards reorder on the existing clock tick without rereading feeds', async ({ page }, info) => {
  const corrected = new Date('2026-10-27T09:00:00Z'), recent = corrected.getTime() / 1000 - 3600;
  const errors = [], reads = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(7680) });
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.route('http://localhost:9013/**', route => {
    const id = route.request().headers().app_id; reads.push(id);
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify([{
      app_id: id, content_id: id, content_title: id === '3201910019365' ? 'Older Prime programme' : 'Newer YouTube programme',
      timestamp: id === '3201910019365' ? recent - 3600 : recent, payload: 'saved-launch-data'
    }]) });
  });
  await page.addInitScript(({ prime, youtube }) => {
    localStorage.setItem('aerotizen.settings.v1', JSON.stringify({ home: [prime], showWeather: false, background: 'black',
      continueWatching: true, continueWatchingApps: [prime, youtube] }));
    window.tizen = { application: {
      getAppsInfo: done => done([{ id: prime, packageId: prime, name: 'Prime Video' },
        { id: youtube, packageId: '9Ur5IzDKqV', name: 'YouTube' }]),
      getAppMetaData: () => [{ key: 'http://samsung.com/tv/metadata/app_support_continue_watching', value: 'true' }]
    } };
  }, { prime, youtube });
  await page.goto('/');
  const titles = page.locator('.continue-title');
  await expect(titles).toHaveText(['Older Prime programme', 'Newer YouTube programme']);
  expect(reads).toHaveLength(2);
  await page.clock.setSystemTime(corrected);
  await page.clock.fastForward(10000);
  await expect(titles).toHaveText(['Newer YouTube programme', 'Older Prime programme']);
  expect(await page.evaluate(() => AeroTizen.continueWatching.items.map(item => item.timestamp))).toEqual([recent, recent - 3600]);
  await page.evaluate(() => { window.correctedCards = [...document.querySelectorAll('.continue-card')]; });
  await page.clock.fastForward(30000);
  expect(reads).toHaveLength(2);
  expect(await page.evaluate(() => correctedCards.every((card, index) => card === document.querySelectorAll('.continue-card')[index]))).toBe(true);
  await page.screenshot({ path: info.outputPath('clock-corrected-order.png') });
  expect(errors).toEqual([]);
});
