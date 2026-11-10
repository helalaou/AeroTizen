const { loadTypeScript } = require("./load_typescript.cjs");
const { createInputsService } = loadTypeScript("launcher/src/services/createInputsService.ts");
const { createInputsPlatform } = loadTypeScript("launcher/src/platform/tizen/createInputsPlatform.ts");

exports.installInputs = (context) => {
  const runtime = context.window.AeroTizen;
  const service = createInputsService({
    platform: createInputsPlatform({
      ...context.window,
      document: context.document,
      removeEventListener: context.window.removeEventListener || (() => {}),
    }),
    settings: runtime.settings,
    timers: { clearInterval() {}, clearTimeout() {}, setTimeout() {}, ...context.window },
    translate: (key, values) => runtime.translate(key, values),
    toast: (message) => runtime.toast(message),
  });
  runtime.inputs = service;
  return service;
};
