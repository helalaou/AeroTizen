// Run on the compiled Settings URL. Keep image transport pending and control only
// artwork's two-second deadline to test retries and cleanup without real delays.
const runSettingsResources = async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  const routes = [];
  await page.route('https://pending-artwork.test/**', route => { routes.push(route); });
  await page.reload();
  await page.waitForFunction(() => AeroTizen.apps.all.length > 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    const A = AeroTizen;
    const nativeSet = window.setTimeout, nativeClear = window.clearTimeout;
    const renderHome = A.homeScreen.render;
    // Closing normally rebuilds Home's independent legacy artwork. Keep those
    // timers outside this Settings-specific resource check.
    A.homeScreen.render = () => {};
    const timers = new Map();
    window.artworkTimers = timers;
    window.restoreTimers = () => {
      window.setTimeout = nativeSet; window.clearTimeout = nativeClear; A.homeScreen.render = renderHome;
    };
    window.setTimeout = (fn, delay, ...args) => {
      if (delay !== 2000) return nativeSet(fn, delay, ...args);
      const run = () => { timers.delete(id); fn(...args); };
      const id = nativeSet(run, delay);
      timers.set(id, () => { nativeClear(id); run(); });
      return id;
    };
    window.clearTimeout = id => { timers.delete(id); nativeClear(id); };
    A.artwork.sources = () => ['https://pending-artwork.test/first', 'https://pending-artwork.test/second'];
    A.settingsUi.open();
    window.oldArtwork = document.querySelector('#all-apps .app-artwork');
    if (timers.size !== A.apps.all.length) throw new Error('Expected one deadline per pending artwork');
    A.settingsUi.close();
    if (timers.size) throw new Error('Closed Settings retained image deadlines');
    if (document.querySelector('#all-apps .app-artwork')) throw new Error('Closed Settings retained a pending image');
    A.settingsUi.open();
    window.oldArtwork.dispatchEvent(new Event('load'));
    if (document.querySelector('#all-apps .has-artwork')) throw new Error('Detached image changed reopened Settings');
    // Expire all first candidates. Each tile must try its second candidate.
    [...timers.values()].forEach(expire => expire());
  });
  await page.waitForFunction(() => [...document.querySelectorAll('#all-apps .app-artwork')]
    .every(image => image.src.endsWith('/second')) && artworkTimers.size === AeroTizen.apps.all.length);
  await page.evaluate(() => {
    [...artworkTimers.values()].forEach(expire => expire());
  });
  await page.waitForFunction(() => !document.querySelector('#all-apps .app-artwork'));
  const result = await page.evaluate(() => {
    if (artworkTimers.size) throw new Error('Exhausted artwork retained deadlines');
    if ([...document.querySelectorAll('#all-apps .app-fallback')].some(element => element.hidden)) {
      throw new Error('Failed artwork hid the brand fallback');
    }
    AeroTizen.settingsUi.close();
    window.restoreTimers();
    return { pendingCleanup: true, staleImageIgnored: true, timeoutRetry: true, exhaustedFallback: true };
  });
  // Complete the detached requests without intentional network-error console noise.
  for (const route of routes) await route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" />' });
  if (errors.length) throw new Error(JSON.stringify(errors));
  return result;
};

module.exports = { runSettingsResources };
