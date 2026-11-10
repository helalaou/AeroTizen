const { loadTypeScript } = require("./load_typescript.cjs");
const { appCatalog } = loadTypeScript("launcher/src/shared/apps/appCatalog.ts");
const { createHomeWatcherPlatform } = loadTypeScript("launcher/src/platform/tizen/createHomeWatcherPlatform.ts");
const { createHomeWatcherService } = loadTypeScript("launcher/src/services/createHomeWatcherService.ts");

exports.installHomeWatcher = (context, catalog = appCatalog) => {
  const window = context.window;
  const runtime = window.AeroTizen;
  const service = createHomeWatcherService({
    appId: runtime.config.APP_ID,
    catalog,
    now: () => context.Date?.now() ?? Date.now(),
    platform: createHomeWatcherPlatform({
      ...window,
      document: context.document,
      XMLHttpRequest: context.XMLHttpRequest,
    }),
    timers: context,
  });
  runtime.homewatch = service;
  return service;
};
