// Exercise real browser focus and keyboard events on the Preact URL.
const runSettingsFocus = async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.reload();
  await page.waitForFunction(() => AeroTizen.apps.all.length > 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    AeroTizen.settings.background = 'aurora'; AeroTizen.settings.save();
    AeroTizen.settingsUi.open();
  });
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-key') === 'bg:aurora');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-key')?.startsWith('bg:') &&
    document.activeElement.getAttribute('data-key') !== 'bg:aurora');
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-key') === 'bg:aurora');
  await page.locator('[data-key="name:HDMI 1"]').click();
  await page.locator('[data-key="name:HDMI 1"] input').fill('React draft');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => AeroTizen.settings.inputNames['HDMI 1'] === 'React draft' &&
    document.activeElement?.getAttribute('data-key') === 'name:HDMI 1');
  const focused = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('#editor [data-key]')];
    if (controls.filter(control => control.classList.contains('focused')).length !== 1) throw new Error('Focus class is not unique');
    if (controls.filter(control => control.tabIndex === 0).length !== 1) throw new Error('Tab position is not unique');
    if (!document.activeElement.classList.contains('focused')) throw new Error('Browser focus and rendered state differ');
    return true;
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !AeroTizen.settingsUi.isOpen() && document.querySelector('#editor').hidden);
  if (await page.evaluate(() => document.querySelector('#editor').contains(document.activeElement))) {
    throw new Error('Closed Settings retained browser focus');
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  return { nativeArrows: true, nativeImeDone: true, renderedFocus: focused, nativeClose: true };
};

module.exports = { runSettingsFocus };
