const { test, expect } = require('@playwright/test');
test('Preact Settings follows TV locale changes without translating app names or losing focus', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.goto('/'); await page.waitForFunction(() => AeroTizen.apps.ready);
  await page.locator('#gear').click();
  await page.locator('[data-key="time:none"]').click();
  const names = await page.locator('#all-apps > .tile').allTextContents();
  await page.evaluate(() => {
    AeroTizen.tizen = { systeminfo: { getPropertyValue: (name, done) => done({ language: 'it-IT' }) } };
    AeroTizen.i18n.refresh();
  });
  await expect(page.locator('[data-key="time:none"]')).toHaveText('Nascondi ora');
  await expect(page.locator('[data-key="time:none"]')).toHaveClass(/focused/);
  await expect(page.locator('h3').filter({ hasText: 'Data e ora' })).toBeVisible();
  expect(await page.locator('#all-apps > .tile').allTextContents()).toEqual(names);
  await page.evaluate(() => {
    AeroTizen.tizen.systeminfo.getPropertyValue = (name, done) => done({ language: 'en-GB' });
    AeroTizen.i18n.refresh();
  });
  await expect(page.locator('[data-key="time:none"]')).toHaveText('No time');
  await expect(page.locator('[data-key="time:none"]')).toHaveClass(/focused/);
  expect(errors).toEqual([]);
});
