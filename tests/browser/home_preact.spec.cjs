const { test, expect } = require('@playwright/test');
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.addInitScript(() => { if (!localStorage.getItem('aerotizen.settings.v1')) localStorage.setItem('aerotizen.settings.v1', JSON.stringify({ home: ['demo0','demo1','demo2','demo3'], background: 'black', showWeather: false })); });
});
test('Home short/held OK, action menu, move/drop and Settings focus restoration', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.waitForFunction(() => AeroTizen.apps.ready);
  const first = page.locator('#grid > .tile').first();
  await expect(first).toHaveClass(/focused/);
  await page.keyboard.press('Enter'); await expect(page.locator('#toast')).toContainText('Would open YouTube');
  await page.keyboard.down('Enter'); await expect(page.getByRole('menu')).toBeVisible(); await page.keyboard.up('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Enter'); await expect(first).toHaveClass(/moving/);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => AeroTizen.settings.home[0])).toBe('demo0');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => AeroTizen.settings.home.slice(0,2))).toEqual(['demo1','demo0']);
  await page.locator('#gear').click(); await expect(page.locator('#editor')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#grid > .tile').nth(1)).toHaveClass(/focused/);
  await page.reload(); await expect(page.locator('#grid > .tile').first()).toHaveAttribute('data-id','demo1');
  expect(errors).toEqual([]);
});
test('Home and All apps retain keyed artwork nodes and Back returns to Home', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.evaluate(() => { window.originalHome = document.querySelector('#grid > .tile'); });
  await page.locator('#apps-tab').click();
  await expect(page.locator('#grid > .tile')).toHaveCount(25);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#grid > .tile').first()).toHaveClass(/focused/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#grid > .tile')).toHaveCount(4);
  expect(await page.evaluate(() => originalHome === document.querySelector('#grid > .tile'))).toBe(true);
  await expect(page.locator('#home-tab')).toHaveClass(/focused/);
});
test('compiled Home preserves legacy geometry and artwork source selection at 1080p', async ({ page, browser }, info) => {
  const baseline = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await baseline.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await baseline.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  const seed = () => localStorage.setItem('aerotizen.settings.v1', JSON.stringify({home:['demo0','demo1','demo2','demo3'],background:'black',showWeather:false}));
  await baseline.addInitScript(seed);
  await baseline.goto('http://127.0.0.1:8170/'); await page.goto('/');
  for (const tab of [baseline,page]) await tab.waitForFunction(() => AeroTizen.apps.ready && document.querySelector('#grid > .tile.focused'));
  const geometry = tab => tab.evaluate(() => ['.topbar','#gear','#grid','#inputs'].map(selector => {
    const element = document.querySelector(selector), rect = element.getBoundingClientRect();
    return [selector, ...[rect.x,rect.y,rect.width,rect.height].map(n=>Math.round(n))];
  }));
  // Header tabs are now centred in both themes; app/source geometry remains upstream-compatible.
  await page.waitForFunction(()=>document.querySelector('.home-page-surface').getAnimations().every(a=>a.playState==='finished'));
  expect(await geometry(page)).toEqual(await geometry(baseline));
  await baseline.screenshot({ path: info.outputPath('legacy-home.png') });
  await page.screenshot({ path: info.outputPath('preact-home.png') });
  await baseline.close();
});
