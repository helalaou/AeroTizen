const { test, expect } = require('@playwright/test');
test('Glass categories support D-pad, Back/Left, single focus plate, wallpaper browsing and Samsung escape', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.addInitScript(() => { if (!localStorage.getItem('aerotizen.settings.v1')) localStorage.setItem('aerotizen.settings.v1', JSON.stringify({glassSettings:true,background:'black',showWeather:false,home:['demo0','demo1','demo2']})); });
  await page.goto('/'); await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.locator('#gear').click();
  await expect(page.locator('#editor')).toHaveClass(/aero-settings-collapsed/);
  await expect(page.locator('[data-key="section:appearance"]')).toHaveClass(/focused/);
  await page.keyboard.press('ArrowDown'); await expect(page.locator('[data-key="section:apps"]')).toHaveClass(/focused/);
  await page.keyboard.press('ArrowRight'); await expect(page.locator('[data-section-pane="apps"]')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#editor')).toHaveClass(/aero-settings-collapsed/);
  for (const category of ['appearance','apps','wallpaper','status','sources']) {
    await page.locator(`[data-key="section:${category}"]`).click();
    await expect(page.locator(`[data-section-pane="${category}"]`)).toBeVisible();
    await expect(page.locator('#editor .focused')).toHaveCount(1);
    await expect(page.locator('.aero-content-glider')).toHaveClass(/is-visible/);
    const current = page.locator('#editor .focused');
    expect(await current.evaluate(node=>getComputedStyle(node).boxShadow)).toBe('none');
    await expect.poll(()=>page.locator('.aero-content-glider').evaluate(plate=>{
      const target=document.querySelector('#editor .focused'), a=plate.getBoundingClientRect(),b=target.getBoundingClientRect();
      return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width),Math.abs(a.height-b.height));
    })).toBeLessThan(2);
    await page.screenshot({path:info.outputPath('glass-'+category+'.png')});
  }
  await page.locator('[data-key="section:wallpaper"]').click();
  const before=await page.evaluate(()=>JSON.stringify(AeroTizen.settings));
  for(const filter of ['photo','solid','gradient','animated']) await page.locator(`[data-key="wallpaper-categories:${filter}"]`).click();
  expect(await page.evaluate(()=>JSON.stringify(AeroTizen.settings))).toBe(before);
  await page.locator('[data-key="section:apps"]').click();
  await page.evaluate(()=>{window.escapeCount=0;AeroTizen.homewatch.openSamsungHome=()=>escapeCount++;});
  await page.locator('#escape').click(); expect(await page.evaluate(()=>escapeCount)).toBe(1);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('#editor')).toBeHidden();
  await page.reload(); expect(await page.evaluate(()=>AeroTizen.settings.glassSettings)).toBe(true);
  expect(errors).toEqual([]);
});
