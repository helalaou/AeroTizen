const { test, expect } = require("./launcher_fixture.cjs");
test("early diagnostics capture a failing main bundle before Home can mount", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.route("**/js/launcher-ui.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'throw new TypeError("Cannot read PRIVATE-PAYLOAD");',
    }),
  );
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => window.AeroDiagnostics.snapshot().records.some((record) => record.event === "ui.error")),
    )
    .toBe(true);
  const snapshot = await page.evaluate(() => window.AeroDiagnostics.snapshot());
  const error = snapshot.records.find((record) => record.event === "ui.error");
  expect(error.data.error).toBe("TypeError");
  expect(error.data.file).toBe("launcher-ui.js");
  expect(JSON.stringify(snapshot)).not.toContain("PRIVATE-PAYLOAD");
  expect(await page.evaluate(() => window.AeroStartup.trace.marks[0].name)).toBe("first-script");
  expect(errors).toEqual(["TypeError"]);
});
