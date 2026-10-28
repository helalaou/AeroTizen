const { test, expect } = require('@playwright/test');
const prime = 'org.tizen.primevideo', itv = 'OEvCiupaFR.ITVHub', channel4 = 'OCaxbgg9v6.chfourctv';
const make = (app, id, title, timestamp) => ({ app_id: app, content_id: id, content_title: title,
  timestamp, season: 1, episode: 1, duration: 300, playback: 0, payload: 'watch?id=' + id, image_url: 'https://artwork.test/' + id + '.svg' });

test('opt-in discovery, selection, merged row, remote navigation, launch and restart persistence', async ({ page }, info) => {
  const errors = [], reads = [];
  let primePlayback = 75;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('https://artwork.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#284859"/><circle cx="40" cy="40" r="30" fill="gold"/><circle cx="760" cy="410" r="30" fill="white"/></svg>' }));
  await page.route('**/opt/share/webappservice/apps_icon/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="304" height="304"><rect width="304" height="304" fill="#43306b"/><circle cx="152" cy="152" r="84" fill="#b8a5ff"/></svg>' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.route('http://localhost:9013/**', route => {
    const id = route.request().headers().app_id; reads.push(id);
    const data = id === '3201910019365' ? [{ ...make(id, 'p1', 'Older programme with a very long video title that must wrap over two lines and end with an ellipsis rather than show the rest of this extra long sentence', 1000), season: 0, episode: 0, playback: primePlayback }] :
      id === '121299000089' ? Array.from({ length: 6 }, (_, i) => ({ ...make(id, 'i' + i, 'Recent episode ' + i + (i === 0 ? ' with a long programme title that must stay on one line and end with an ellipsis' : ''), 2000 - i), playback: 150 })) : [];
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'text/plain', body: JSON.stringify(data) });
  });
  await page.addInitScript(({ prime, itv, channel4 }) => {
    if (!localStorage.getItem('aerotizen.settings.v1')) localStorage.setItem('aerotizen.settings.v1', JSON.stringify({
      home: [prime], tempUnit: 'C', timeFormat: '24', background: 'black', showWeather: false
    }));
    const apps = [
      { id: prime, name: 'Prime Video', packageId: prime },
      { id: 'prime.hidden.service', name: 'Service', show: false, packageId: prime },
      { id: itv, name: 'ITVX', packageId: 'OEvCiupaFR' },
      { id: channel4, name: 'Channel 4', packageId: 'OCaxbgg9v6' },
      { id: 'bbc.app', name: 'BBC iPlayer', packageId: 'abcdefghij' }
    ];
    window.testLaunches = [];
    window.tizen = {
      application: {
        getAppsInfo: done => done(apps),
        getAppMetaData: id => [{ key: 'http://samsung.com/tv/metadata/' +
          (id === 'prime.hidden.service' ? 'use.continue_watching' : id === 'bbc.app' ? 'use.preview' : 'app_support_continue_watching'),
        value: id === 'prime.hidden.service' ? 'bg_service' : id === prime ? 'false' : 'true' }],
        launchAppControl: (control, id) => testLaunches.push({ control, id })
      },
      ApplicationControl: function (operation, uri, mime, category, data) { Object.assign(this, { operation, data }); },
      ApplicationControlData: function (key, value) { Object.assign(this, { key, value }); }
    };
  }, { prime, itv, channel4 });
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.clock.fastForward(300001); // Exercise ordinary refreshes after the startup window.
  await expect(page.locator('#continue-section')).toBeHidden();
  expect(reads).toEqual([]);
  await page.locator('#gear').click();
  await page.locator('[data-key="continue-watching:true"]').click();
  await expect(page.locator('.continue-option')).toHaveCount(3);
  await expect(page.locator('.continue-option')).not.toContainText(['BBC iPlayer']);
  expect(reads).toEqual([]);
  for (const id of [prime, itv, channel4]) await page.locator('[data-key="continue-app:' + id + '"]').click();
  await expect.poll(() => page.evaluate(() => AeroTizen.continueWatching.sources.find(s => s.name === 'Channel 4').status)).toBe('No items available');
  await expect(page.locator('.continue-option')).not.toContainText(['5 items']);
  await expect(page.locator('.continue-option').first()).toHaveCSS('width', '176px');
  await expect(page.locator('.continue-option.has-artwork')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('continue-watching-selection.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('.continue-card')).toHaveCount(7);
  await expect(page.locator('.continue-card').first()).toContainText('Recent episode 0');
  await expect(page.locator('.continue-source')).toHaveCount(0);
  await expect(page.locator('.continue-app-icon')).toHaveCount(7);
  await expect(page.locator('.continue-app-icon .app-artwork')).toHaveCount(7);
  await expect(page.locator('.continue-label .continue-app-icon')).toHaveCount(0);
  expect(await page.locator('.continue-card').first().evaluate(n => {
    const frame = n.querySelector('.continue-image-wrap').getBoundingClientRect(), icon = n.querySelector('.continue-app-icon').getBoundingClientRect();
    return icon.top === frame.top + 12 && icon.right === frame.right - 12;
  })).toBe(true);
  expect(await page.locator('.continue-image-wrap').first().evaluate(n => n.clientWidth / n.clientHeight)).toBeCloseTo(16 / 9, 2);
  await expect(page.locator('.continue-image-wrap').first()).toHaveCSS('height', '233px');
  await expect(page.locator('.continue-image').first()).toHaveCSS('object-fit', 'contain');
  const episodic = page.locator('.continue-card').first(), episodeTitle = episodic.locator('.continue-title');
  await expect(episodeTitle).toHaveCSS('white-space', 'nowrap');
  await expect(episodeTitle).toHaveCSS('text-overflow', 'ellipsis');
  expect(await episodeTitle.evaluate(n => n.scrollWidth > n.clientWidth && n.clientHeight <= 31)).toBe(true);
  const video = page.locator('.continue-card').last(), videoTitle = video.locator('.continue-title');
  await expect(video.locator('.continue-episode')).toHaveCount(0);
  await expect(videoTitle).toHaveCSS('-webkit-line-clamp', '2');
  expect(await videoTitle.evaluate(n => n.clientHeight >= 59 && n.clientHeight <= 60 && n.scrollHeight > n.clientHeight)).toBe(true);
  expect(await episodic.evaluate(n => {
    const frame = n.querySelector('.continue-image-wrap'), bar = n.querySelector('.continue-progress'), label = n.querySelector('.continue-label');
    return frame.offsetTop + frame.offsetHeight === bar.offsetTop && bar.offsetTop + bar.offsetHeight === label.offsetTop;
  })).toBe(true);
  await expect(episodic.locator('.continue-progress-fill')).toHaveCSS('width', '207px');
  expect(await episodeTitle.evaluate(n => n.clientWidth)).toBe(382);
  await page.evaluate(() => {
    window.savedCards = [...document.querySelectorAll('.continue-card')];
    window.savedIcons = savedCards.map(n => n.querySelector('.continue-app-icon .app-artwork'));
    AeroTizen.continueWatching.refresh();
  });
  await expect(page.locator('.continue-card')).toHaveCount(7);
  await expect.poll(() => page.evaluate(() => AeroTizen.continueWatching.sources.find(s => s.name === 'Channel 4').status)).toBe('No items available');
  expect(await page.evaluate(() => savedCards.every((n, i) => n === document.querySelectorAll('.continue-card')[i] && savedIcons[i] === n.querySelector('.continue-app-icon .app-artwork')))).toBe(true);
  const settledReads = reads.length;
  await page.clock.fastForward(35000);
  expect(reads.length).toBe(settledReads);
  primePlayback = 90;
  await page.evaluate(() => AeroTizen.continueWatching.refresh());
  await expect.poll(() => video.locator('.continue-progress-fill').evaluate(n => n.clientWidth)).toBe(124);
  expect(await page.evaluate(() => savedCards.slice(0, -1).every((n, i) => n === document.querySelectorAll('.continue-card')[i] && savedIcons[i] === n.querySelector('.continue-app-icon .app-artwork')))).toBe(true);
  expect(await page.evaluate(() => savedCards[6] !== document.querySelectorAll('.continue-card')[6])).toBe(true);
  await page.keyboard.press('ArrowDown'); // app row -> Continue Watching
  await expect(page.locator('.continue-card').nth(2)).toHaveClass(/focused/);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.continue-card').first()).toHaveClass(/focused/);
  await page.screenshot({ path: info.outputPath('continue-watching-episode-title.png') });
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  const last = page.locator('.continue-card').last();
  await expect(last).toHaveClass(/focused/);
  await expect.poll(async () => { const rect = await last.boundingBox(); return rect.x + rect.width; }).toBeLessThanOrEqual(1870);
  await page.screenshot({ path: info.outputPath('continue-watching-home.png') });
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => testLaunches.at(-1))).toMatchObject({ id: prime,
    control: { data: [{ key: 'PAYLOAD', value: [JSON.stringify({ values: 'watch?id=p1' })] }] } });
  await page.locator('#apps-tab').click();
  await expect(page.locator('#continue-section')).toBeHidden();
  await page.locator('#home-tab').click(); await expect(page.locator('#continue-section')).toBeVisible();
  await page.reload();
  await expect(page.locator('.continue-card')).toHaveCount(7);
  await page.locator('#gear').click();
  await page.locator('[data-key="continue-watching:false"]').click();
  const stopped = reads.length;
  await page.keyboard.press('Escape');
  await expect(page.locator('#continue-section')).toBeHidden();
  await page.waitForTimeout(100); expect(reads.length).toBe(stopped);
  expect(await page.evaluate(() => AeroTizen.settings.continueWatchingApps.length)).toBe(3);
  expect(errors).toEqual([]);
});
