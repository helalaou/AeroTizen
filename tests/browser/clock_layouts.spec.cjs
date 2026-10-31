const { test, expect } = require('@playwright/test');

test('custom clock styles preserve upstream date/time preferences, visibility and reload persistence', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
  await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
  await page.clock.install({ time: new Date('2026-10-28T14:05:00Z') });
  await page.goto('/');
  await page.waitForFunction(() => AeroTizen.apps.all.length > 0);
  await expect(page.locator('#aero-v991-widget')).toBeHidden();
  await page.locator('#gear').click();
  await page.locator('[data-key="clock-layouts:custom"]').click();
  for (const style of ['vertical', 'horizontal', 'minimal', 'bold']) {
    await page.locator(`[data-key="clock-styles:${style}"]`).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#aero-v991-widget')).toBeVisible();
    expect(await page.locator('.aero-v991-digits').getAttribute('aria-label')).toBe(await page.locator('#time').textContent());
    await page.screenshot({ path: info.outputPath('clock-' + style + '.png') });
    await page.locator('#gear').click();
  }
  await page.locator('[data-key="time:24"]').click();
  await page.locator('[data-key="date:none"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#aero-v991-date')).toBeHidden();
  await page.reload();
  await expect(page.locator('#aero-v991-widget')).toHaveClass('style-bold');
  expect(await page.evaluate(() => [AeroTizen.settings.timeFormat, AeroTizen.settings.dateFormat])).toEqual(['24', 'none']);
  await page.locator('#gear').click(); await page.locator('[data-key="clock-layouts:classic"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#aero-v991-widget')).toBeHidden();
  await expect(page.locator('#time')).toBeVisible();
  expect(errors).toEqual([]);
});
