import type { TemperatureUnit } from "../../contracts/preferences";
import type { SolarPhase, WeatherReading } from "../../contracts/status";

export const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface CachedWeather extends WeatherReading {
  readonly city: string;
  readonly day?: unknown;
  readonly source: string;
  readonly temp: number;
  readonly unit: TemperatureUnit;
  readonly zone?: string;
}

export const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const text = (value: unknown): string => (typeof value === "string" ? value : "");

export const locationCoordinates = (value: unknown) => {
  const geo = record(value);
  if (
    !geo ||
    geo.error ||
    !finiteNumber(geo.latitude) ||
    Math.abs(geo.latitude) > 90 ||
    !finiteNumber(geo.longitude) ||
    Math.abs(geo.longitude) > 180
  ) {
    return null;
  }
  return { latitude: geo.latitude, longitude: geo.longitude };
};

const solarDays = (value: unknown): NonNullable<WeatherReading["solar"]> => {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  const days: { sunrise: number; sunset: number }[] = [];
  for (const item of value) {
    const day = record(item);
    if (day && finiteNumber(day.sunrise) && finiteNumber(day.sunset)) {
      days.push(Object.freeze({ sunrise: day.sunrise, sunset: day.sunset }));
    }
  }
  return Object.freeze(days);
};

export const cachedWeather = (value: unknown): CachedWeather | null => {
  const data = record(value);
  if (
    !data ||
    !finiteNumber(data.temp) ||
    !finiteNumber(data.code) ||
    !finiteNumber(data.at) ||
    (data.unit !== "C" && data.unit !== "F") ||
    typeof data.source !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    temp: data.temp,
    code: data.code,
    at: data.at,
    city: text(data.city),
    zone: text(data.zone),
    unit: data.unit,
    source: data.source,
    day: data.day,
    solar: solarDays(data.solar),
  });
};

export const parseSolar = (value: unknown): NonNullable<WeatherReading["solar"]> => {
  const daily = record(value);
  if (!daily || !Array.isArray(daily.sunrise) || !Array.isArray(daily.sunset)) {
    return Object.freeze([]);
  }
  const days: { sunrise: number; sunset: number }[] = [];
  for (let index = 0; index < Math.min(daily.sunrise.length, daily.sunset.length); index++) {
    const rise = String(daily.sunrise[index] || "");
    const set = String(daily.sunset[index] || "");
    // Requests use UTC. Epochs keep the solar phase independent of the TV timezone.
    const sunrise = Date.parse(rise + (/[zZ]|[+-]\d\d:\d\d$/.test(rise) ? "" : "Z"));
    const sunset = Date.parse(set + (/[zZ]|[+-]\d\d:\d\d$/.test(set) ? "" : "Z"));
    if (Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise) {
      days.push(Object.freeze({ sunrise, sunset }));
    }
  }
  return Object.freeze(days);
};

export const solarPhase = (reading: WeatherReading | null, now: number): SolarPhase => {
  if (
    !reading ||
    !finiteNumber(reading.at) ||
    !finiteNumber(now) ||
    now < reading.at ||
    now - reading.at > MAX_AGE_MS
  ) {
    return "";
  }
  const days: readonly unknown[] = Array.isArray(reading.solar) ? reading.solar : [];
  for (const value of days) {
    const day = record(value);
    const rise = day?.sunrise;
    const set = day?.sunset;
    if (!finiteNumber(rise) || !finiteNumber(set) || rise <= 0 || set <= rise || set - rise >= 24 * 3600000) {
      continue;
    }
    // A solar pair describes the day centred on solar noon, not the TV's calendar day.
    const noon = rise + (set - rise) / 2;
    if (now < noon - 12 * 3600000 || now >= noon + 12 * 3600000) {
      continue;
    }
    if (now >= set - 45 * 60000 && now < set + 20 * 60000) {
      return "sunset";
    }
    if (now >= rise - 10 * 60000 && now < set - 45 * 60000) {
      return "day";
    }
    return "night";
  }
  return "";
};
