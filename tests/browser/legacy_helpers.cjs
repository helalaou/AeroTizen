const path = require("node:path");

// The frozen renderer still requests shared /launcher/js/ URLs. Pin the DOM
// utility and the last pre-migration watcher so retiring production scripts
// cannot change the comparison renderer. The compiled app has no overrides.
const preserveLegacyDom = async (page) => {
  await page.route("http://127.0.0.1:8170/launcher/js/dom.js", (route) =>
    route.fulfill({ path: path.join(__dirname, "../fixtures/legacy-dom.js"), contentType: "text/javascript" }),
  );
  await page.route("http://127.0.0.1:8170/launcher/js/homewatch.js", (route) =>
    route.fulfill({ path: path.join(__dirname, "../fixtures/homewatch/homewatch.js"), contentType: "text/javascript" }),
  );
  for (const file of ["config.js", "settings.js", "clock.js", "network.js", "inputs.js", "continue-watching.js"]) {
    await page.route(`http://127.0.0.1:8170/launcher/js/${file}`, (route) =>
      route.fulfill({
        path: path.join(__dirname, "../fixtures/legacy-launcher/js", file),
        contentType: "text/javascript",
      }),
    );
  }
  for (const file of ["startup.js", "diagnostics.js", "diagnostics-privacy.js", "diagnostics-storage.js"]) {
    await page.route(`http://127.0.0.1:8170/launcher/js/${file}`, (route) =>
      route.fulfill({ path: path.join(__dirname, "../fixtures/diagnostics", file), contentType: "text/javascript" }),
    );
  }
};

module.exports = { preserveLegacyDom };
