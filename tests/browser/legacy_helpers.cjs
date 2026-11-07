const path = require("node:path");

// The frozen renderer still requests the shared /launcher/js/dom.js URL.
// Pin its a6e54f8 utility so retiring production DOM commands cannot change
// the comparison renderer. No override is installed on the compiled app.
const preserveLegacyDom = async (page) => {
  await page.route("http://127.0.0.1:8170/launcher/js/dom.js", (route) =>
    route.fulfill({ path: path.join(__dirname, "../fixtures/legacy-dom.js"), contentType: "text/javascript" }),
  );
  for (const file of ["config.js", "settings.js", "clock.js", "network.js", "inputs.js", "continue-watching.js"]) {
    await page.route(`http://127.0.0.1:8170/launcher/js/${file}`, (route) =>
      route.fulfill({
        path: path.join(__dirname, "../fixtures/legacy-launcher/js", file),
        contentType: "text/javascript",
      }),
    );
  }
};

module.exports = { preserveLegacyDom };
