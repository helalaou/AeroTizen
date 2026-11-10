const { loadTypeScript } = require("./load_typescript.cjs");
const { createAppsPlatform } = loadTypeScript("launcher/src/platform/tizen/createAppsPlatform.ts");
const { createAppsService } = loadTypeScript("launcher/src/services/createAppsService.ts");

// Exercise the same service and Tizen boundary as the compiled launcher.
exports.installApps = (context) => {
  const runtime = context.window.AeroTizen;
  const service = createAppsService({
    catalog: runtime.catalog,
    config: runtime.config,
    platform: createAppsPlatform(context.window),
    storage: context.localStorage || { getItem: () => null, setItem() {} },
  });
  runtime.apps = service;
  return service;
};
