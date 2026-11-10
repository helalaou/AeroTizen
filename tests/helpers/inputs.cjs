const { loadTypeScript } = require("./load_typescript.cjs");
const { createInputsService } = loadTypeScript("launcher/src/services/createInputsService.ts");
const { createInputsPlatform } = loadTypeScript("launcher/src/platform/tizen/createInputsPlatform.ts");
const { createPreviewPlatforms } = loadTypeScript("launcher/src/dev/createPreviewPlatforms.ts");

exports.installInputs = (context) => {
  const runtime = context.window.AeroTizen;
  const platforms = createPreviewPlatforms(() => !runtime.tizen?.systeminfo);
  const service = createInputsService({
    platform: platforms.inputs(
      createInputsPlatform({
        ...context.window,
        document: context.document,
        removeEventListener: context.window.removeEventListener || (() => {}),
      }),
    ),
    settings: runtime.settings,
    timers: { clearInterval() {}, clearTimeout() {}, setTimeout() {}, ...context.window },
    translate: (key, values) => runtime.translate(key, values),
    toast: (message) => runtime.toast(message),
  });
  runtime.inputs = service;
  return service;
};
