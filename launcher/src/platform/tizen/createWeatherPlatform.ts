import type { WeatherPlatform } from "../../contracts/status";

const REQUEST_TIMEOUT_MS = 8000;

// Keep XMLHttpRequest for the supported TV engines; the service receives only parsed data and cancellation.
export const createWeatherPlatform = (host: { XMLHttpRequest: typeof XMLHttpRequest }): WeatherPlatform => ({
  requestJSON(url, done) {
    const request = new host.XMLHttpRequest();
    let finished = false;
    const finish = (data: unknown) => {
      if (!finished) {
        finished = true;
        done(data);
      }
    };
    request.onload = () => {
      let data: unknown = null;
      try {
        if (request.status === 200) {
          data = JSON.parse(request.responseText) as unknown;
        }
      } catch {
        // Malformed data follows the same failure path as an unsuccessful request.
      }
      finish(data);
    };
    request.onerror = request.ontimeout = request.onabort = () => finish(null);
    try {
      request.open("GET", url);
      request.timeout = REQUEST_TIMEOUT_MS;
      request.send();
    } catch {
      finish(null);
    }
    return () => {
      if (finished) {
        return;
      }
      finished = true;
      try {
        request.abort();
      } catch {
        // An already-closed TV transport still stays cancelled.
      }
    };
  },
});
