const { loadTypeScript } = require("./load_typescript.cjs");
const { createAppsPlatform } = loadTypeScript("launcher/src/platform/tizen/createAppsPlatform.ts");
const { createAppsService } = loadTypeScript("launcher/src/services/createAppsService.ts");
const { appCatalog } = loadTypeScript("launcher/src/shared/apps/appCatalog.ts");
const { createPreviewPlatforms } = loadTypeScript("launcher/src/dev/createPreviewPlatforms.ts");

// Exercise the same service and Tizen boundary as the compiled launcher.
exports.installApps = (context) => {
  const runtime = context.window.AeroTizen;
  const platforms = createPreviewPlatforms(() => !runtime.tizen?.application);
  const service = createAppsService({
    catalog: runtime.catalog || appCatalog,
    config: runtime.config,
    platform: platforms.apps(createAppsPlatform(context.window)),
    storage: context.localStorage || { getItem: () => null, setItem() {} },
  });
  runtime.apps = service;
  return service;
};
