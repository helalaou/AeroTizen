const { test, expect } = require('@playwright/test');
test('Square and Rectangle retain native artwork sources while 3/4/5-column navigation and persistence work', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.goto('/'); await page.waitForFunction(() => AeroTizen.apps.ready);
  for (const mode of ['square','rectangle']) {
    for (const columns of [3,4,5]) {
      await page.locator('#gear').click();
      await page.locator(`[data-key="home-card-mode:${mode}"]`).click();
      await page.locator(`[data-key="home-card-columns:${columns}"]`).click();
      await page.keyboard.press('Escape'); await page.locator('#home-tab').click(); await page.locator('#apps-tab').click();
      await expect(page.locator('#grid')).toHaveClass(new RegExp('cards-' + mode));
      const tiles = page.locator('#grid > .tile');
      const positions = await tiles.evaluateAll(nodes=>nodes.slice(0,6).map(node=>({top:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight})));
      expect(positions.filter(p=>p.top===positions[0].top)).toHaveLength(columns);
      if(mode==='rectangle') expect(positions[0].width/positions[0].height).toBeCloseTo(576/300,1);
      await page.keyboard.press('ArrowDown'); await expect(tiles.first()).toHaveClass(/focused/);
      await page.keyboard.press('ArrowDown'); await expect(tiles.nth(columns)).toHaveClass(/focused/);
      await page.screenshot({path:info.outputPath(`${mode}-${columns}.png`)});
    }
  }
  await page.reload();
  expect(await page.evaluate(()=>[AeroTizen.settings.homeCardMode,AeroTizen.settings.homeCardColumns])).toEqual(['rectangle',5]);
  expect(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/assets/brands/')))).toBe(false);
  expect(errors).toEqual([]);
});
