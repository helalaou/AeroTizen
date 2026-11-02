const { test, expect } = require('@playwright/test');
for (const glassSettings of [false, true]) {
  test(`shared category drawer retains navigation when appearance changes from ${glassSettings ? 'Glass' : 'Classic'}`, async ({ page }) => {
    await page.route('https://**/*', r => r.fulfill({body:'{}'}));
    await page.route('http://127.0.0.1:47790/**', r => r.fulfill({body:'{}'}));
    await page.addInitScript(glassSettings => {if (!localStorage.getItem('aerotizen.settings.v1')) localStorage.setItem('aerotizen.settings.v1', JSON.stringify({glassSettings, home:['demo0'],background:'black',showWeather:false}));},glassSettings);
    await page.goto('/'); await page.waitForFunction(()=>AeroTizen.apps.ready);
    await page.locator('#gear').click();
    await expect(page.locator('#editor')).toHaveClass(/aero-settings-collapsed/);
    await expect(page.locator('#editor .focused')).toHaveAttribute('data-key','section:appearance');
    await page.keyboard.press('ArrowRight');
    await page.locator(`[data-key="settings-appearance:${!glassSettings}"]`).click();
    await expect(page.locator('#editor')).not.toHaveClass(/aero-settings-collapsed/);
    await expect(page.locator('#editor .focused')).toHaveAttribute('data-key',`settings-appearance:${!glassSettings}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toHaveClass(/aero-settings-collapsed/);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-section-pane="apps"]')).toBeVisible();
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toBeHidden();
    await page.reload(); await page.locator('#gear').click();
    await expect(page.locator('#editor')).toHaveClass(!glassSettings ? /aero-settings-glass/ : /aero-settings-classic/);
  });
}
