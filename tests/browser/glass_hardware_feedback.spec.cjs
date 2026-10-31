const { test, expect } = require('@playwright/test');

for (const height of [720, 1080]) for (const glass of [false, true]) {
  test(`${glass ? 'Glass' : 'Classic'} header slots and complete Continue Watching focus ring at ${height}p`, async ({ page }, info) => {
    await page.setViewportSize({ width: height === 720 ? 1280 : 1920, height });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
    await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
    await page.route('http://localhost:9013/**', route => route.fulfill({
      headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json',
      body: JSON.stringify([{ app_id: '3201910019365', content_id: 'one', content_title: 'Programme', timestamp: 1000, payload: 'watch?id=one' }])
    }));
    await page.addInitScript(glass => {
      const prime = 'org.tizen.primevideo';
      localStorage.setItem('aerotizen.settings.v1', JSON.stringify({
        glassSettings: glass, background: 'black', showWeather: false, home: [prime],
        continueWatching: true, continueWatchingApps: [prime]
      }));
      window.tizen = { application: {
        getAppsInfo: done => done([{ id: prime, packageId: prime, name: 'Prime Video' }]),
        getAppMetaData: () => [{ key: 'http://samsung.com/tv/metadata/app_support_continue_watching', value: 'true' }]
      } };
    }, glass);
    await page.goto('/');
    await expect(page.locator('.continue-card')).toHaveCount(1);
    const slots = await page.locator('#gear, #samsung-home-shortcut, #network').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
    }));
    expect(slots.map(slot => slot.width)).toEqual([64, 64, 64]);
    expect(slots.map(slot => slot.height)).toEqual([64, 64, 64]);
    expect(slots[0].y).toBe(slots[1].y); expect(slots[1].y).toBe(slots[2].y);
    expect(slots[1].x - slots[0].x).toBe(slots[2].x - slots[1].x);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.continue-card')).toHaveClass(/focused/);
    // The box shadow lies outside the transformed border box. Include its full
    // scaled 9px radius rather than checking only the card's content rectangle.
    await expect.poll(() => page.locator('.continue-card').evaluate(card => {
      const r = card.getBoundingClientRect(), clip = card.closest('.continue-viewport').getBoundingClientRect();
      const scale = r.width / card.offsetWidth, ring = 9 * scale;
      return r.top - ring >= clip.top && r.bottom + ring <= clip.bottom && r.left - ring >= clip.left;
    })).toBe(true);
    await page.screenshot({ path: info.outputPath('complete-focus-ring.png') });
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#grid > .tile')).toHaveClass(/focused/);
    expect(errors).toEqual([]);
  });
}

for (const height of [720, 1080]) for (const glass of [false, true]) for (const count of [0, 1, 2, 3, 4, 5]) {
  test(`${glass ? 'Glass' : 'Classic'} dock sizes ${count} source slots at ${height}p without stretching sparse inputs`, async ({ page }, info) => {
    await page.setViewportSize({ width: height === 720 ? 1280 : 1920, height });
    await page.route('https://**/*', route => route.fulfill({ body: '{}' }));
    await page.route('http://127.0.0.1:47790/**', route => route.fulfill({ body: '{}' }));
    await page.addInitScript(({ count, glass }) => {
      localStorage.setItem('aerotizen.settings.v1', JSON.stringify({ glassSettings: glass, background: 'black', showWeather: false, home: ['demo0'] }));
      window.tizen = { systeminfo: { getPropertyValue: (name, done) => {
        if (name === 'VIDEOSOURCE') done({ connected: Array.from({ length: count }, (_, i) => ({ type: 'HDMI', number: i + 1 })), disconnected: [] });
      } } };
    }, { count, glass });
    await page.goto('/');
    const cards = page.locator('#inputs > .tile');
    await expect(cards).toHaveCount(count);
    const widths = await cards.evaluateAll(nodes => nodes.map(node => node.offsetWidth));
    expect(widths.every(width => width <= (glass ? 354 : 576))).toBe(true);
    if (!count) {
      await expect(page.locator('#inputs-section')).toBeHidden();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#grid > .tile')).toHaveClass(/focused/);
      return;
    }
    if (glass && count < 5) {
      expect(widths).toEqual(Array(count).fill(354));
      expect(await page.locator('#inputs').evaluate(node => node.offsetWidth)).toBeLessThan(1792);
    }
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#inputs > .focused')).toHaveCount(1);
    for (let i = 0; i < count; i++) await page.keyboard.press('ArrowLeft');
    await expect(cards.first()).toHaveClass(/focused/);
    if (count > 1) {
      await page.keyboard.press('ArrowRight');
      await expect(cards.nth(1)).toHaveClass(/focused/);
      await page.keyboard.press('ArrowLeft');
      await expect(cards.first()).toHaveClass(/focused/);
    }
    await page.screenshot({ path: info.outputPath('source-dock.png') });
  });
}
