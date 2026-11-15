const { test, expect } = require("./launcher_fixture.cjs");

test("the packaged launcher starts, moves focus and checks for updates without selected newer APIs", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("https://**/*", (route) => route.fulfill({ body: "{}" }));
  await page.route("http://127.0.0.1:47790/**", (route) => route.fulfill({ body: "{}" }));
  await page.route("https://api.github.com/repos/helalaou/AeroTizen/releases?*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.addInitScript(() => {
    // Chrome 63 lacks these APIs. Leave the supported platform features available.
    for (const [object, names] of [
      [window, ["AbortController", "ResizeObserver", "queueMicrotask", "structuredClone"]],
      [Array.prototype, ["at", "flat", "flatMap"]],
      [Element.prototype, ["replaceChildren", "toggleAttribute"]],
      [Intl, ["ListFormat", "Locale", "RelativeTimeFormat"]],
      [Object, ["fromEntries", "hasOwn"]],
      [Promise, ["allSettled"]],
      [String.prototype, ["replaceAll"]],
    ]) {
      for (const name of names) Reflect.deleteProperty(object, name);
    }
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function () {
      focus.call(this);
    };
    localStorage.setItem(
      "aerotizen.settings.v1",
      JSON.stringify({
        home: ["demo0", "demo1"],
        theme: "gloss",
        language: "en",
        background: "black",
        showWeather: false,
      }),
    );
  });

  await page.goto("/");
  const cards = page.locator("#grid > [data-id]");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(1)).toBeFocused();

  await page.locator("#gear").click();
  await page.locator('[data-key="section:about"]').click();
  const about = page.locator('[data-section-pane="about"]');
  await about.getByRole("button", { name: "Check for updates" }).click();
  await expect(about.getByText("You have the latest version.")).toBeVisible();
  expect(errors).toEqual([]);
});
