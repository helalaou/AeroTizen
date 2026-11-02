const { expect } = require('@playwright/test');

// Use the real category controls; no private state or hidden-control activation.
async function openCategory(page, category) {
  await page.locator(`[data-key="section:${category}"]`).click();
  await expect(page.locator(`[data-section-pane="${category}"]`)).toBeVisible();
}
async function closeSettings(page) {
  if (!(await page.locator('#editor').getAttribute('class')).includes('aero-settings-collapsed')) {
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor')).toBeHidden();
}
module.exports = { openCategory, closeSettings };
