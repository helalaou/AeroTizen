const base = require("@playwright/test");
const path = require("node:path");
const { chromiumMajor } = require("../../launcher-browser.json");

let preview;
const previewScript = () =>
  preview ||
  (preview = (async () => {
    const { build } = await import("vite");
    const result = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        target: ["chrome" + chromiumMajor, "es2018"],
        lib: {
          entry: path.join(__dirname, "../../launcher/src/dev/installTestPlatforms.ts"),
          name: "BrowserPreviewFixture",
          formats: ["iife"],
        },
      },
    });
    const builds = Array.isArray(result) ? result : [result];
    return builds.flatMap((build) => build.output).find((file) => file.type === "chunk").code;
  })());

exports.test = base.test.extend({
  previewPlatforms: [true, { option: true }],
  platformSetup: [
    async ({ context, previewPlatforms }, use) => {
      if (previewPlatforms) await context.addInitScript({ content: await previewScript() });
      await use();
    },
    { auto: true },
  ],
});
exports.expect = base.expect;
