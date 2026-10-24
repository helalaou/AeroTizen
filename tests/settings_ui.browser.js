// Run by npm run test:browser against the baseline and compiled launcher.
// This uses real browser rendering and DOM key events, with weather requests mocked.
const runSettingsUi = async (page, { baselineUrl, screenshotPath }) => {
  const preactUrl = page.url();
  const results = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(message.type() + ': ' + message.text());
  });
  await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ latitude: 0, longitude: 0, city: 'Test location', country_code: 'GB',
      current: { temperature_2m: 20, weather_code: 0 }, results: [] }) }));
  for (const variant of ['baseline', 'preact']) {
    await page.goto(variant === 'preact' ? preactUrl : baselineUrl);
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForFunction(() => window.AeroTizen && AeroTizen.apps.all.length > 0);
    const check = await page.evaluate(async variant => {
      const A = AeroTizen, K = A.config.KEY;
      function assert(value, message) { if (!value) throw new Error(variant + ': ' + message); }
      function key(code, type = 'keydown') {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { value: code }); document.dispatchEvent(event);
      }
      function find(value) {
        const element = document.querySelector('#editor [data-key="' + value + '"]');
        assert(element, 'missing control: ' + value);
        return element;
      }
      function input(field, value) { field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); }
      // Allow the initial commit and passive store subscriptions to complete.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const before = JSON.stringify(A.settings.home);
      // Use the real home -> gear -> OK -> Settings route.
      key(K.UP); key(K.LEFT); key(K.ENTER); key(K.ENTER, 'keyup');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      assert(A.settingsUi.isOpen(), 'remote opens Settings');
      assert(document.querySelector('#editor .focused').dataset.key === 'bg:aurora', 'initial focus');
      if (variant === 'preact') {
        assert(document.activeElement === document.querySelector('#editor .focused'), 'remote state and browser focus agree');
        assert(document.querySelectorAll('#editor [data-key][tabindex="0"]').length === 1, 'one remote control is in the tab order');
      }
      assert(document.querySelectorAll('#editor [data-key]').length >= 80, 'all sections present');
      for (let i = 0; i < 10; i++) key(K.UP);
      assert(document.querySelectorAll('#editor .focused').length === 1, 'top boundary keeps one focus');
      const weatherField = document.querySelector('#weather-location input');
      const appTile = find('app:' + A.apps.all[0].id);
      find('time:24').click();
      assert(A.settings.timeFormat === '24', 'time setting updates');
      if (variant === 'preact') {
        assert(weatherField === document.querySelector('#weather-location input'), 'unrelated input identity retained');
        assert(appTile === find('app:' + A.apps.all[0].id), 'artwork node retained on clock change');
      }
      assert(JSON.parse(localStorage.getItem(A.config.STORAGE_KEY)).timeFormat === '24', 'setting persisted');
      find('time:none').click(); assert(A.$('time').hidden, 'time hidden');
      find('time:24').click(); assert(!A.$('time').hidden, 'time restored');
      find('weather-display:false').click(); assert(A.$('weather').hidden, 'weather hidden');
      find('weather-display:true').click();
      find('network-visibility:false').click(); assert(A.$('network').hasAttribute('hidden'), 'network hidden');
      find('network-visibility:true').click(); assert(!A.$('network').hasAttribute('hidden'), 'network restored');
      find(variant === 'preact' ? 'live-tv-visibility:false' : 'live-tv:false').click();
      assert(A.settings.showLiveTv === false, 'Live TV hidden');
      find(variant === 'preact' ? 'card-sizes:small' : 'cards:small').click();
      assert(A.settings.cardSize === 'small', 'card size saved');
      find(variant === 'preact' ? 'input-visibility:true' : 'inputs:true').click();
      assert(!Array.from(document.querySelector('#inputs').children).some(el => el.textContent === 'HDMI 2'), 'disconnected HDMI hidden');
      let name = find('name:HDMI 1').querySelector('input');
      find('name:HDMI 1').click(); input(name, 'Test console');
      key(K.IME_DONE);
      assert(document.activeElement !== name && A.settings.inputNames['HDMI 1'] === 'Test console', 'IME Done saves and restores navigation');
      name = find('name:HDMI 1').querySelector('input');
      name.focus(); input(name, ''); name.blur();
      assert(!A.settings.inputNames['HDMI 1'], 'empty name restores TV label');
      const homeBeforeToggle = A.settings.home.slice();
      find('app:' + A.config.FIREPLACE_ID).click();
      assert(A.settings.home.indexOf(A.config.FIREPLACE_ID) < 0, 'Fireplace can be hidden');
      find('app:' + A.config.FIREPLACE_ID).click();
      assert(A.settings.home.length === homeBeforeToggle.length, 'Fireplace can be restored');
      // Search callbacks cannot apply after editing or closing. No real geocoder call.
      const callbacks = [];
      window.Weather.searchLocations = (query, done) => callbacks.push(done);
      let field = document.querySelector('#weather-location input');
      input(field, 'Example'); find('weather:search').click();
      field = document.querySelector('#weather-location input'); input(field, 'Changed');
      callbacks.shift()([{ label: 'Stale', name: 'Stale', latitude: 0, longitude: 0 }]);
      assert(!document.querySelector('#weather-results').textContent.includes('Stale'), 'late query ignored');
      find('weather:search').click();
      callbacks.shift()([{ label: 'Test location', name: 'Test location', latitude: 0, longitude: 0, country_code: 'GB' }]);
      find('weather:result:0').click();
      assert(A.settings.weatherLocation.label === 'Test location', 'location selected');
      field = document.querySelector('#weather-location input'); input(field, 'Pending');
      find('weather:search').click(); A.settingsUi.close();
      callbacks.shift()([{ label: 'Closed search', latitude: 0, longitude: 0 }]);
      A.settingsUi.open();
      assert(!document.querySelector('#weather-results').textContent.includes('Closed search'), 'closed search ignored');
      find(variant === 'preact' ? 'weather-visibility:false' : 'weather:show:false').click();
      assert(A.settings.weatherShowLocation === false, 'location visibility saved');
      find('preview').click(); assert(document.body.classList.contains('previewing'), 'preview opens');
      key(K.RIGHT); assert(!document.body.classList.contains('previewing'), 'any key exits preview');
      if (variant === 'preact') {
        assert(A.$('toast').hidden, 'preview exit hides its message');
        find('preview').click(); A.settingsUi.open();
        assert(!document.body.classList.contains('previewing') && A.$('toast').hidden, 'open resets preview and its message together');
        assert(document.activeElement === document.querySelector('#editor .focused'), 'preview return restores browser focus');
        find('preview').click(); A.settingsUi.close();
        assert(!document.body.classList.contains('editing') && !document.body.classList.contains('previewing') &&
          A.$('toast').hidden, 'close clears all presentation state');
        A.settingsUi.open();
      }
      find('bg:black').click(); assert(document.querySelector('#speed-row').hidden, 'static background hides speed');
      find('bg:aurora').click();
      A.settingsUi.close(); A.settingsUi.open();
      // Move from the first swatch row to the speed slider using only remote arrows.
      for (let i = 0; i < 9; i++) key(K.LEFT);
      key(K.DOWN); key(K.DOWN);
      assert(document.querySelector('#editor .focused').dataset.key === 'speed', 'remote reaches speed');
      for (let i = 0; i < 30; i++) key(K.LEFT);
      assert(A.settings.speed === A.config.SPEED.MIN, 'speed lower bound');
      for (let i = 0; i < 30; i++) key(K.RIGHT);
      assert(A.settings.speed === A.config.SPEED.MAX, 'speed upper bound');
      for (let i = 0; i < 60; i++) key(K.DOWN);
      assert(document.querySelector('#editor .focused').textContent.includes('Samsung Home'), 'bottom row reachable');
      assert(document.querySelector('#editor').scrollTop > 0, 'focus scrolls into view');
      key(K.ESC); assert(!A.settingsUi.isOpen(), 'Back closes Settings');
      A.settings.home = []; A.settings.save(); A.homeScreen.render(); A.settingsUi.open(); A.settingsUi.close();
      assert(A.settings.home.length === 0 && !document.querySelector('#grid').children.length, 'empty Home stays empty');
      A.settings.home = JSON.parse(before); A.settings.background = 'black'; A.settings.speed = 1; A.settings.save();
      A.applyBackground(); A.homeScreen.render();
      return { variant, remote: true, persistence: true, staleSearch: true, preview: true, emptyHome: true };
    }, variant);
    results.push(check);
    await page.evaluate(() => AeroTizen.settingsUi.open());
    await page.screenshot({ path: screenshotPath(variant) });
    await page.reload();
    if (!(await page.evaluate(() => AeroTizen.settings.timeFormat === '24' && AeroTizen.settings.weatherShowLocation === false))) {
      throw new Error(variant + ': settings did not survive reload');
    }
  }
  // Test the real asynchronous artwork loader, including invalid-image fallback.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.route('https://artwork.test/**', route => route.fulfill({
    contentType: 'image/svg+xml', body: route.request().url().endsWith('/bad') ? 'invalid image' :
      '<svg xmlns="http://www.w3.org/2000/svg" width="304" height="304"><rect width="304" height="304" fill="purple"/></svg>'
  }));
  await page.evaluate(() => {
    const A = AeroTizen;
    const original = A.tiles.app;
    window.settingsArtworkConstructions = 0;
    A.tiles.app = app => { window.settingsArtworkConstructions++; return original(app); };
    A.artwork.sources = () => ['https://artwork.test/bad', 'https://artwork.test/good'];
    A.settingsUi.open();
    document.querySelector('#all-apps .app-tile').click();
  });
  await page.waitForFunction(() => document.querySelectorAll('#all-apps .has-artwork').length === AeroTizen.apps.all.length);
  const artwork = await page.evaluate(() => {
    const tile = document.querySelector('#all-apps .app-tile');
    if (!tile.querySelector('.app-fallback').hidden) throw new Error('Artwork did not replace fallback');
    if (!tile.classList.contains('focused')) throw new Error('Artwork arrival removed remote focus');
    document.querySelector('[data-key="time:12"]').click();
    if (tile !== document.querySelector('#all-apps .app-tile')) throw new Error('Clock change rebuilt artwork');
    tile.click();
    if (tile !== document.querySelector('#all-apps .app-tile')) throw new Error('Selection rebuilt artwork');
    if (window.settingsArtworkConstructions !== 0) throw new Error('Settings called a legacy DOM constructor');
    return { asynchronous: true, fallback: true, stableOnClockAndSelection: true };
  });
  // External legacy writes publish into the same Settings store.
  await page.evaluate(() => {
    AeroTizen.settings.timeFormat = '24';
    AeroTizen.settings.inputNames = { 'HDMI 1': 'External name' };
    AeroTizen.settings.save();
  });
  await page.waitForFunction(() => document.querySelector('[data-key="time:24"]').getAttribute('aria-pressed') === 'true' &&
    document.querySelector('[data-key="name:HDMI 1"] input').value === 'External name');
  const lifecycle = await page.evaluate(async () => {
    const A = AeroTizen;
    const find = key => document.querySelector('#editor [data-key="' + key + '"]');
    const field = find('name:HDMI 1').querySelector('input');
    field.focus(); field.value = 'Local draft'; field.dispatchEvent(new Event('input', { bubbles: true }));
    A.settings.inputNames = { 'HDMI 1': 'Concurrent value' }; A.settings.save();
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (field.value !== 'Local draft') throw new Error('External update discarded an active draft');
    A.settingsUi.close();
    if (A.settings.inputNames['HDMI 1'] !== 'Local draft') throw new Error('Close did not commit active draft');
    A.settings.inputNames = { 'HDMI 1': 'Changed while closed' }; A.settings.save();
    A.settingsUi.open();
    if (field.value !== 'Changed while closed') throw new Error('Reopen missed an external update');
    if (field !== find('name:HDMI 1').querySelector('input')) throw new Error('Reopen rebuilt the cached form');
    // A pending reply delivered after close + reopen must remain cancelled.
    const replies = [];
    Weather.searchLocations = (query, done) => replies.push(done);
    const query = find('weather:query').querySelector('input');
    query.value = 'Pending'; query.dispatchEvent(new Event('input', { bubbles: true }));
    find('weather:search').click(); A.settingsUi.close(); A.settingsUi.open();
    replies.shift()([{ label: 'Outdated result', name: 'Outdated result', latitude: 0, longitude: 0 }]);
    if (document.querySelector('#weather-results').textContent.includes('Outdated result')) throw new Error('Reopen accepted an old reply');
    const original = A.settings.speed;
    for (let i = 0; i < 10; i++) { A.settingsUi.close(); A.settingsUi.open(); }
    find('bg:aurora').click();
    for (let i = 0; i < 9; i++) A.settingsUi.keydown(A.config.KEY.LEFT, { preventDefault() {} });
    A.settingsUi.keydown(A.config.KEY.DOWN, { preventDefault() {} });
    A.settingsUi.keydown(A.config.KEY.DOWN, { preventDefault() {} });
    A.settingsUi.keydown(A.config.KEY.RIGHT, { preventDefault() {} });
    if (A.settings.speed !== original + A.config.SPEED.STEP) throw new Error('Repeated opens duplicated key handlers');
    return { externalUpdates: true, draftPreserved: true, closeCommitsDraft: true, staleAfterReopen: true, repeatedOpen: true };
  });
  if (errors.length) throw new Error(JSON.stringify(errors));
  return { results, artwork, lifecycle, runtimeErrors: errors };
};

module.exports = { runSettingsUi };
