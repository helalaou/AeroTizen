const vm = require("node:vm");
const { loadTypeScript } = require("./load_typescript.cjs");
const { createClockPlatform } = loadTypeScript("launcher/src/platform/tizen/createClockPlatform.ts");
const { createClockService } = loadTypeScript("launcher/src/services/createClockService.ts");

exports.installClock = (context, now = vm.runInContext("() => new Date().getTime()", context)) => {
  const host = context.window;
  const runtime = host.AeroTizen;
  const platform = createClockPlatform(
    {
      document: host.document || { documentElement: { lang: "" } },
      Intl: host.Intl,
      navigator: host.navigator || {},
      tizen: host.tizen,
    },
    () => runtime.settings?.getSnapshot().numerals ?? "latn",
  );
  runtime.clock = createClockService({ platform, now, timers: { setInterval: context.setInterval } });
};
