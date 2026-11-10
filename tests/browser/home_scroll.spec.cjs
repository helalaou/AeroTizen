const { test, expect } = require("@playwright/test");
test("Home interpolates the top fade without replacing its mask and keeps the bottom fade fixed", async ({
  page,
}, info) => {
  await page.route("https://**/*", (r) => r.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (r) => r.fulfill({ body: "{}" }));
  await page.addInitScript(() =>
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        home: Array.from({ length: 12 }, (_, i) => "demo" + i),
        background: "black",
        showWeather: false,
      }),
    ),
  );
  await page.goto("/");
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready);
  const viewport = page.locator("[data-home-viewport]"),
    mask = page.locator("[data-home-mask]");
  const maskY = () => mask.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).m42);
  await expect(viewport).toHaveAttribute("data-scrolled", "false");
  const bottom = await viewport.evaluate((n) => getComputedStyle(n).webkitMaskImage);
  expect(bottom).toContain("calc(100% - 80px)");
  const image = await mask.evaluate((n) => getComputedStyle(n).webkitMaskImage);
  await expect.poll(maskY).toBe(-112);
  const top = await viewport.evaluate((n) => n.getBoundingClientRect().top);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(viewport).toHaveAttribute("data-scrolled", "true");
  await expect.poll(maskY).toBe(0);
  expect(await mask.evaluate((n) => getComputedStyle(n).webkitMaskImage)).toBe(image);
  expect(await viewport.evaluate((n) => getComputedStyle(n).webkitMaskImage)).toBe(bottom);
  expect(await viewport.evaluate((n) => n.getBoundingClientRect().top)).toBe(top);
  expect(await page.locator("[data-home-header]").evaluate((n) => n.getBoundingClientRect().top)).toBe(0);
  await page.screenshot({ path: info.outputPath("scrolled-fade.png") });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(viewport).toHaveAttribute("data-scrolled", "false");
  await expect.poll(maskY).toBe(-112);
  expect(await mask.evaluate((n) => getComputedStyle(n).transitionProperty)).toBe("transform");
  const midpoint = await page.evaluate(() => {
    const mask = document.querySelector("[data-home-mask]");
    const content = document.querySelector("[data-home-mask-content]");
    getComputedStyle(mask).transform;
    AeroTizen.homeScreen.keydown(40, { preventDefault() {} });
    AeroTizen.homeScreen.keydown(40, { preventDefault() {} });
    const motions = [mask, content].map((node) =>
      node.getAnimations().find((a) => a.transitionProperty === "transform"),
    );
    if (motions.some((motion) => !motion)) return null;
    for (const motion of motions) {
      motion.pause();
      motion.currentTime = 160;
    }
    const result = {
      mask: new DOMMatrix(getComputedStyle(mask).transform).m42,
      content: new DOMMatrix(getComputedStyle(content).transform).m42,
      contentTop: content.getBoundingClientRect().top,
      viewportTop: document.querySelector("[data-home-viewport]").getBoundingClientRect().top,
    };
    motions.forEach((motion) => motion.finish());
    return result;
  });
  expect(midpoint).not.toBeNull();
  expect(midpoint.mask).toBeGreaterThan(-112);
  expect(midpoint.mask).toBeLessThan(0);
  expect(midpoint.mask + midpoint.content).toBeCloseTo(0, 3);
  expect(midpoint.contentTop).toBeCloseTo(midpoint.viewportTop, 3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const durations = await mask.evaluate((n) => getComputedStyle(n).transitionDuration.split(",").map(parseFloat));
  expect(durations.every((duration) => duration === 0)).toBe(true);
});
