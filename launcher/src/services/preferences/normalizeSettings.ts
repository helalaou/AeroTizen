import { normalizeColour } from "../../backgrounds/colours";
import { normalizeGradient } from "../../backgrounds/gradients";
import type { SettingsDefaults, SettingsPreferences, WeatherLocation } from "../../contracts/preferences";

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const choice = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const boolean = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value : fallback);
const ids = (value: unknown, limit = Infinity): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_.-]{1,200}$/.test(id))),
      ].slice(0, limit)
    : [];
const dictionary = <T extends string | boolean>(value: unknown, kind: "string" | "boolean"): Record<string, T> =>
  Object.entries(record(value)).reduce<Record<string, T>>(
    (result, [key, item]) => (typeof item === kind ? { ...result, [key]: item as T } : result),
    {},
  );

const location = (value: unknown): WeatherLocation | null => {
  const item = record(value);
  if (
    typeof item.name !== "string" ||
    !item.name.trim() ||
    typeof item.latitude !== "number" ||
    !Number.isFinite(item.latitude) ||
    Math.abs(item.latitude) > 90 ||
    typeof item.longitude !== "number" ||
    !Number.isFinite(item.longitude) ||
    Math.abs(item.longitude) > 180
  ) {
    return null;
  }
  return {
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
    ...(typeof item.label === "string" ? { label: item.label } : {}),
    ...(typeof item.country_code === "string" ? { country_code: item.country_code } : {}),
    ...(typeof item.timezone === "string" && item.timezone ? { timezone: item.timezone } : {}),
  };
};

// Validate current-schema values before publishing a snapshot or writing storage.
export const normalizeSettings = (
  value: unknown,
  defaults: SettingsDefaults,
  locale: { timeFormat(): "12" | "24"; tempUnit(): "C" | "F" },
  speedRange: { MIN: number; MAX: number },
): SettingsPreferences => {
  const saved = record(value);
  const data = { ...defaults, ...saved };
  const columns = data.homeCardColumns;
  const home = data.home;
  const validHome = Array.isArray(home) ? ids(home) : defaults.home;
  return {
    home: home === null ? null : validHome,
    theme: choice(data.theme, ["classic", "glass", "gloss"], defaults.theme),
    performanceMode: boolean(data.performanceMode, defaults.performanceMode),
    homeCardColumns: typeof columns === "number" && [3, 4, 5].includes(columns) ? columns : defaults.homeCardColumns,
    homeAppLayout: choice(data.homeAppLayout, ["grid", "scroll"], defaults.homeAppLayout),
    background: text(data.background, defaults.background),
    customColour: normalizeColour(data.customColour, defaults.customColour),
    customGradient: normalizeGradient(data.customGradient, defaults.customGradient),
    weatherPhoto: boolean(data.weatherPhoto, defaults.weatherPhoto),
    speed:
      typeof data.speed === "number" && Number.isFinite(data.speed)
        ? Math.max(speedRange.MIN, Math.min(speedRange.MAX, data.speed))
        : defaults.speed,
    showWeather: boolean(data.showWeather, defaults.showWeather),
    showTime: boolean(data.showTime, defaults.showTime),
    showNetwork: boolean(data.showNetwork, defaults.showNetwork),
    tempUnit: data.tempUnit === "C" || data.tempUnit === "F" ? data.tempUnit : defaults.tempUnit || locale.tempUnit(),
    timeZone: choice(data.timeZone, ["tv", "weather"] as const, defaults.timeZone),
    weatherLocation: location(data.weatherLocation),
    weatherShowLocation: boolean(data.weatherShowLocation, defaults.weatherShowLocation),
    dateFormat: choice(
      data.dateFormat,
      ["compact", "short", "long", "numeric-short", "numeric", "iso", "none"],
      defaults.dateFormat,
    ),
    language: text(data.language, defaults.language),
    numerals: choice(data.numerals, ["latn", "arab"], defaults.numerals),
    clockLayout: choice(data.clockLayout, ["classic", "custom"], defaults.clockLayout),
    aeroClockStyle: choice(data.aeroClockStyle, ["vertical", "horizontal", "minimal", "bold"], defaults.aeroClockStyle),
    timeFormat:
      data.timeFormat === "12" || data.timeFormat === "24"
        ? data.timeFormat
        : defaults.timeFormat || locale.timeFormat(),
    continueWatching: boolean(data.continueWatching, defaults.continueWatching),
    continueWatchingApps: ids(data.continueWatchingApps, 100),
    showLiveTv: boolean(data.showLiveTv, defaults.showLiveTv),
    hideDisconnectedHdmi: boolean(data.hideDisconnectedHdmi, defaults.hideDisconnectedHdmi),
    hdmiNativeViewer: boolean(data.hdmiNativeViewer, defaults.hdmiNativeViewer),
    hdmiKeepVisible: dictionary<boolean>(data.hdmiKeepVisible, "boolean"),
    inputNames: dictionary<string>(data.inputNames, "string"),
  };
};
