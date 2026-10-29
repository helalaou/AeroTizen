const { test, expect } = require('@playwright/test');

for (const glass of [false, true]) {
  test(`weather photos stay behind the unfocused ${glass ? 'Glass' : 'Classic'} header and viewport`, async ({ page }) => {
    await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
    await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
    await page.addInitScript(glassSettings => localStorage.setItem('aerotizen.settings.v1', JSON.stringify({
      home: ['demo0'], background: 'black', showWeather: false, showNetwork: true,
      clockLayout: 'classic', glassSettings
    })), glass);
    await page.goto('/');
    await page.waitForFunction(() => AeroTizen.apps.ready);
    await expect(page.locator('#gear')).not.toHaveClass(/focused/);
    // Exercise the actual wallpaper layer without relying on a live forecast.
    // Enable its hit testing only in this test to detect paint-order occlusion.
    await page.evaluate(() => {
      const layer = document.getElementById('weather-photo');
      layer.hidden = false;
      layer.classList.add('active');
      layer.style.pointerEvents = 'auto';
    });
    for (const selector of ['#gear', '#network', '#home-tab', '#apps-tab', '#time', '.content-viewport']) {
      const exposed = await page.locator(selector).evaluate(element => {
        const r = element.getBoundingClientRect();
        const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return target !== null && element.contains(target);
      });
      expect(exposed, `${selector} must paint above the wallpaper without focus`).toBe(true);
    }
    await page.locator('#gear').click();
    await expect(page.locator('#editor')).toBeVisible();
    if (!glass) await expect(page.locator('.topbar')).toHaveCSS('visibility', 'hidden');
    await page.keyboard.press('Escape');
    await expect(page.locator('.topbar')).toHaveCSS('visibility', 'visible');
    await page.evaluate(() => document.body.classList.add('tv'));
    await expect(page.locator('.topbar')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('#weather-photo')).toHaveCSS('display', 'none');
  });
}
