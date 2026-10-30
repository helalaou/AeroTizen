const { test, expect } = require('@playwright/test');

test('Preact standby overrides persist without confusing custom labels with device recognition', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.addInitScript(() => { if (!localStorage.getItem('aerotizen.settings.v1')) localStorage.setItem('aerotizen.settings.v1', JSON.stringify({
    background: 'black', showWeather: false, hideDisconnectedHdmi: true,
    inputNames: { 'HDMI 2': 'Custom console label' }
  })); });
  await page.goto('/');
  await page.waitForFunction(() => AeroTizen.inputs.sources.length === 4);
  await expect(page.locator('#inputs')).toContainText('PC');
  await expect(page.locator('#inputs')).not.toContainText('Custom console label');
  await page.locator('#gear').click();
  await page.locator('[data-key="hdmi-keep:2:true"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#inputs')).toContainText('Custom console label');
  await page.reload();
  await expect(page.locator('#inputs')).toContainText('Custom console label');
  expect(await page.evaluate(() => AeroTizen.settings.hdmiKeepVisible['2'])).toBe(true);
  await page.locator('#gear').click();
  await page.locator('[data-key="hdmi-keep:2:false"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#inputs')).not.toContainText('Custom console label');
  expect(errors).toEqual([]);
});
