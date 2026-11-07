const { loadTypeScript } = require("./load_typescript.cjs");
const { createNetworkPlatform } = loadTypeScript("launcher/src/platform/tizen/createNetworkPlatform.ts");
const { createNetworkService } = loadTypeScript("launcher/src/services/createNetworkService.ts");

exports.installNetwork = (context) => {
  const runtime = context.window.AeroTizen;
  const host = {
    tizen: context.window.tizen || runtime.tizen,
    webapis: context.window.webapis,
    navigator: context.navigator || context.window.navigator || { onLine: true },
    addEventListener: (name, listener) => context.window.addEventListener?.(name, listener),
    removeEventListener: (name, listener) => context.window.removeEventListener?.(name, listener),
  };
  const network = createNetworkService({
    platform: createNetworkPlatform(host),
    settings: runtime.settings,
    timers: { setInterval: context.setInterval, clearInterval: context.clearInterval || (() => {}) },
  });
  runtime.network = network;
  return network;
};
