const { loadTypeScript } = require("./load_typescript.cjs");
const { createSettingsService } = loadTypeScript("launcher/src/services/createSettingsService.ts");
const { defaultTemperatureUnit } = loadTypeScript("launcher/src/platform/tizen/defaultTemperatureUnit.ts");

exports.createTestSettings = (defaults = {}, options = {}) => {
  const data = new Map();
  return createSettingsService({
    defaults,
    storageKey: "aerotizen.settings.v1",
    legacyStorageKeys: [],
    speedRange: { MIN: 0.25, MAX: 3 },
    locale: { timeFormat: () => "24", tempUnit: () => "C" },
    storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
    ...options,
  });
};

// Platform tests use the same TypeScript preference service as the widget.
exports.installSettings = (context, defaults) => {
  const host = context.window;
  const runtime = host.AeroTizen;
  const settings = createSettingsService({
    defaults,
    storage: context.localStorage,
    storageKey: runtime.config.STORAGE_KEY,
    legacyStorageKeys: runtime.config.LEGACY_STORAGE_KEYS,
    speedRange: runtime.config.SPEED,
    locale: {
      timeFormat: () => runtime.clock.defaultTimeFormat(),
      tempUnit: () => defaultTemperatureUnit(host.navigator?.languages || [host.navigator?.language], host.Intl),
    },
  });
  runtime.settings = settings;
  return settings;
};
