import type { SettingsStore, TemperatureUnit, WeatherLocation } from "../contracts/preferences";
import type { WeatherPlatform, WeatherService, WeatherSnapshot } from "../contracts/status";
import type { Store } from "../shared/state/createStore";
import { equalRecord } from "../shared/state/equalRecord";

import type { CachedWeather } from "./weather/readings";
import {
  cachedWeather,
  finiteNumber,
  locationCoordinates,
  MAX_AGE_MS,
  parseSolar,
  record,
  solarPhase,
  text,
} from "./weather/readings";

const CACHE_KEY = "aerotizen.weather.v2";
const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

interface WeatherOptions {
  readonly fetch: boolean;
  readonly geo: WeatherLocation | null;
  readonly showLocation: boolean;
  readonly source: string;
  readonly unit: TemperatureUnit;
  readonly visible: boolean;
  readonly wallpaper: boolean;
}

export const createWeatherService = ({
  platform,
  settings,
  clock,
  storage,
  now,
  timers,
}: {
  platform: WeatherPlatform;
  settings: Pick<SettingsStore, "getSnapshot" | "subscribe">;
  clock: Store<number>;
  storage: Pick<Storage, "getItem" | "setItem">;
  now: () => number;
  timers: Pick<Window, "setInterval" | "clearInterval">;
}): WeatherService => {
  const listeners = new Set<() => void>();
  const automaticRequests = new Set<() => void>();
  const searchRequests = new Set<() => void>();
  const unsubscribers: (() => void)[] = [];
  let reading: CachedWeather | null = null;
  let snapshot: WeatherSnapshot | undefined;
  let publishedSnapshot: WeatherSnapshot | undefined;
  let generation = 0;
  let started = false;
  let disposed = false;
  let interval: number | undefined;
  let requestOptions: WeatherOptions | undefined;
  let lastRefresh: { source: string; unit: TemperatureUnit; at: number } | undefined;

  const options = (): WeatherOptions => {
    const values = settings.getSnapshot();
    const location = values.weatherLocation;
    const geo =
      locationCoordinates(location) && typeof location?.name === "string" && location.name.trim() ? location : null;
    return {
      unit: values.tempUnit === "F" ? "F" : "C",
      geo,
      source: geo ? JSON.stringify([geo.latitude, geo.longitude, geo.name, geo.country_code]) : "auto",
      visible: values.showWeather !== false,
      wallpaper: values.weatherPhoto === true,
      fetch: values.showWeather !== false || values.weatherPhoto === true,
      showLocation: values.weatherShowLocation !== false,
    };
  };
  const validReading = (opt: WeatherOptions) =>
    reading && reading.source === opt.source && now() >= reading.at && now() - reading.at <= MAX_AGE_MS
      ? reading
      : null;
  const getSnapshot = (): WeatherSnapshot => {
    const opt = options();
    const current = validReading(opt);
    let temperature = current?.temp ?? null;
    if (current && current.unit !== opt.unit && temperature !== null) {
      temperature = opt.unit === "F" ? (temperature * 9) / 5 + 32 : ((temperature - 32) * 5) / 9;
    }
    const next = {
      temperature,
      city: current?.city ?? "",
      code: current?.code ?? null,
      visible: Boolean(current && opt.visible),
      showLocation: opt.showLocation,
    };
    if (!snapshot || !equalRecord(snapshot, next)) {
      snapshot = Object.freeze(next);
    }
    return snapshot;
  };
  const publish = (readingChanged = false) => {
    if (disposed) {
      return;
    }
    const next = getSnapshot();
    if (next !== publishedSnapshot || readingChanged) {
      publishedSnapshot = next;
      [...listeners].forEach((listener) => listener());
    }
  };
  const requestJSON = (url: string, done: (data: unknown) => void, pending: Set<() => void>) => {
    let finished = false;
    let abort = () => {};
    const cancel = () => {
      if (!finished) {
        finished = true;
        pending.delete(cancel);
        abort();
      }
    };
    pending.add(cancel);
    abort = platform.requestJSON(url, (data) => {
      if (!finished && !disposed) {
        finished = true;
        pending.delete(cancel);
        done(data);
      }
    });
    // A platform callback can finish synchronously or dispose the service before returning.
    if (finished) {
      abort();
    }
    return cancel;
  };
  const cancelAutomatic = () => {
    if (automaticRequests.size) {
      lastRefresh = undefined;
    }
    generation++;
    [...automaticRequests].forEach((cancel) => cancel());
  };
  const stopTimer = () => {
    if (interval !== undefined) {
      timers.clearInterval(interval);
      interval = undefined;
    }
  };
  const refresh = () => {
    if (disposed || !started) {
      return;
    }
    cancelAutomatic();
    const version = generation;
    const opt = options();
    previousOptions = opt;
    publish();
    if (!opt.fetch || disposed) {
      stopTimer();
      return;
    }
    requestOptions = opt;
    lastRefresh = { source: opt.source, unit: opt.unit, at: now() };
    const current = () => {
      const next = options();
      return !disposed && next.fetch && version === generation && next.source === opt.source && next.unit === opt.unit;
    };
    const forecast = (value: unknown) => {
      const coordinates = locationCoordinates(value);
      const geo = record(value);
      if (!current() || !coordinates || !geo) {
        return;
      }
      const url =
        "https://api.open-meteo.com/v1/forecast?latitude=" +
        coordinates.latitude +
        "&longitude=" +
        coordinates.longitude +
        "&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=UTC&forecast_days=2" +
        (opt.unit === "F" ? "&temperature_unit=fahrenheit" : "");
      requestJSON(
        url,
        (data) => {
          const forecastData = record(data);
          const conditions = record(forecastData?.current);
          if (
            !current() ||
            !forecastData ||
            forecastData.error ||
            !conditions ||
            !finiteNumber(conditions.temperature_2m) ||
            !finiteNumber(conditions.weather_code)
          ) {
            return;
          }
          reading = Object.freeze({
            temp: conditions.temperature_2m,
            code: conditions.weather_code,
            city: text(geo.name) || text(geo.city),
            day: conditions.is_day,
            solar: parseSolar(forecastData.daily),
            unit: opt.unit,
            source: opt.source,
            at: now(),
          });
          try {
            storage.setItem(CACHE_KEY, JSON.stringify(reading));
          } catch {
            // Weather remains usable when app storage is blocked or full.
          }
          publish(true);
        },
        automaticRequests,
      );
    };
    if (opt.geo) {
      forecast(opt.geo);
    } else {
      requestJSON("https://ipapi.co/json/", forecast, automaticRequests);
    }
  };
  let previousOptions = options();
  const reconcile = () => {
    if (disposed || !started) {
      return;
    }
    const opt = options();
    const sourceChanged = opt.source !== previousOptions.source || opt.unit !== previousOptions.unit;
    previousOptions = opt;
    if (!opt.fetch) {
      stopTimer();
      cancelAutomatic();
    }
    publish();
    if (!opt.fetch) {
      return;
    }
    const time = now();
    const pending = automaticRequests.size && requestOptions?.source === opt.source && requestOptions.unit === opt.unit;
    const needsSolar = opt.wallpaper && (!validReading(opt) || !solarPhase(reading, time));
    const retryDue =
      !lastRefresh ||
      lastRefresh.source !== opt.source ||
      lastRefresh.unit !== opt.unit ||
      time < lastRefresh.at ||
      time - lastRefresh.at >= REFRESH_INTERVAL_MS;
    const cached = validReading(opt);
    const stale =
      interval === undefined && (!cached || cached.unit !== opt.unit || time - cached.at >= REFRESH_INTERVAL_MS);
    if (!pending && (sourceChanged || stale || needsSolar) && (!opt.wallpaper || retryDue)) {
      refresh();
    }
    if (!disposed && interval === undefined) {
      interval = timers.setInterval(refresh, REFRESH_INTERVAL_MS);
    }
  };
  return {
    getSnapshot,
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    currentReading: () => validReading(options()),
    solarPhase,
    refresh,
    searchLocations(query, done) {
      if (disposed) {
        return () => undefined;
      }
      const text = query.trim();
      if (text.length < 2) {
        done([]);
        return () => undefined;
      }
      return requestJSON(
        "https://geocoding-api.open-meteo.com/v1/search?name=" +
          encodeURIComponent(text) +
          "&count=5&language=en&format=json",
        (value) => {
          const data = record(value);
          if (!data || data.error || (data.results && !Array.isArray(data.results))) {
            done(null);
            return;
          }
          const results = Array.isArray(data.results) ? data.results : [];
          const locations: WeatherLocation[] = [];
          for (const value of results) {
            const geo = record(value);
            const coordinates = locationCoordinates(value);
            if (!geo || !coordinates || typeof geo.name !== "string" || !geo.name.trim()) {
              continue;
            }
            const parts = [geo.name];
            for (const part of [geo.admin2, geo.admin1, geo.country]) {
              if (typeof part === "string" && part && !parts.includes(part)) {
                parts.push(part);
              }
            }
            locations.push({
              name: geo.name,
              label: parts.join(", "),
              ...coordinates,
              country_code: typeof geo.country_code === "string" ? geo.country_code : "",
            });
          }
          done(locations);
        },
        searchRequests,
      );
    },
    start() {
      if (disposed || started) {
        return;
      }
      started = true;
      try {
        reading = cachedWeather(JSON.parse(storage.getItem(CACHE_KEY) || "null") as unknown);
      } catch {
        reading = null;
      }
      unsubscribers.push(
        settings.subscribe(reconcile),
        clock.subscribe(() => publish()),
      );
      reconcile();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopTimer();
      cancelAutomatic();
      [...searchRequests].forEach((cancel) => cancel());
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      listeners.clear();
    },
  };
};
