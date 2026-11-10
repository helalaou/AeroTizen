// Weather from Open-Meteo, using a saved location or an approximate IP location.
// Refresh every 20 minutes; keep matching readings for up to two hours while offline.
window.Weather = (function () {
  "use strict";

  var CACHE = "aerotizen.weather.v2";
  var REFRESH = 20 * 60 * 1000;
  var MAX_AGE = 2 * 60 * 60 * 1000;
  var reading = null,
    requestVersion = 0,
    timer = null,
    automaticRequests = [];
  var lastRefresh = null,
    requestOptions = null;
  var settingsOf = function () {
    return {};
  };

  var listeners = [],
    snapshot = null;
  function getSnapshot() {
    var opt = options(),
      w = validReading(reading, opt) ? reading : null;
    var temperature = w ? w.temp : null;
    if (w && w.unit !== opt.unit) {
      temperature = opt.unit === "F" ? (temperature * 9) / 5 + 32 : ((temperature - 32) * 5) / 9;
    }
    var city = w && opt.visible && opt.showLocation ? String(w.city || "") : "";
    var visible = Boolean(w && opt.visible),
      code = w ? w.code : null;
    if (
      !snapshot ||
      snapshot.temperature !== temperature ||
      snapshot.city !== city ||
      snapshot.visible !== visible ||
      snapshot.code !== code ||
      snapshot.showLocation !== opt.showLocation
    ) {
      snapshot = Object.freeze({
        temperature: temperature,
        city: city,
        code: code,
        visible: visible,
        showLocation: opt.showLocation,
      });
    }
    return snapshot;
  }
  function publish() {
    getSnapshot();
    listeners.slice().forEach(function (listener) {
      listener();
    });
  }

  function getJSON(url, cb, automatic) {
    var x = new XMLHttpRequest(),
      finished = false;
    function forget() {
      var index = automaticRequests.indexOf(cancel);
      if (index >= 0) {
        automaticRequests.splice(index, 1);
      }
    }
    function done(data) {
      if (!finished) {
        finished = true;
        forget();
        cb(data);
      }
    }
    function cancel() {
      if (finished) {
        return;
      }
      finished = true;
      forget();
      try {
        x.abort();
      } catch (e) {}
    }
    x.onload = function () {
      var data = null;
      try {
        if (x.status === 200) {
          data = JSON.parse(x.responseText);
        }
      } catch (e) {}
      done(data);
    };
    x.onerror =
      x.ontimeout =
      x.onabort =
        function () {
          done(null);
        };
    if (automatic) {
      automaticRequests.push(cancel);
    }
    try {
      x.open("GET", url);
      x.timeout = 8000;
      x.send();
    } catch (e) {
      done(null);
    }
  }

  function cancelRequests() {
    // A cancelled attempt must not defer a later re-enable for twenty minutes.
    if (automaticRequests.length) {
      lastRefresh = null;
    }
    requestVersion++;
    automaticRequests.slice().forEach(function (cancel) {
      cancel();
    });
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function number(value) {
    return typeof value === "number" && isFinite(value);
  }

  function validLocation(geo) {
    return (
      geo &&
      !geo.error &&
      number(geo.latitude) &&
      Math.abs(geo.latitude) <= 90 &&
      number(geo.longitude) &&
      Math.abs(geo.longitude) <= 180
    );
  }

  function options() {
    var s = settingsOf(),
      geo = s.weatherLocation;
    if (!validLocation(geo) || typeof geo.name !== "string" || !geo.name.trim()) {
      geo = null;
    }
    return {
      unit: s.tempUnit === "F" ? "F" : "C",
      geo: geo,
      source: geo ? JSON.stringify([geo.latitude, geo.longitude, geo.name, geo.country_code]) : "auto",
      visible: s.showWeather !== false,
      wallpaper: s.weatherPhoto === true,
      fetch: s.showWeather !== false || s.weatherPhoto === true,
      showLocation: s.weatherShowLocation !== false,
    };
  }

  function validReading(w, opt) {
    return (
      w &&
      number(w.temp) &&
      number(w.code) &&
      number(w.at) &&
      (w.unit === "C" || w.unit === "F") &&
      w.source === opt.source &&
      Date.now() >= w.at &&
      Date.now() - w.at <= MAX_AGE
    );
  }

  // A solar pair describes the day centered on its solar noon, not an arbitrary
  // TV timezone. Do not extrapolate yesterday's or tomorrow's daylight into today.
  function solarPhase(w, now) {
    if (!w || !number(w.at) || !number(now) || now < w.at || now - w.at > MAX_AGE || !Array.isArray(w.solar)) {
      return "";
    }
    for (var i = 0; i < w.solar.length; i++) {
      var day = w.solar[i] || {},
        rise = day.sunrise,
        set = day.sunset;
      if (!number(rise) || !number(set) || rise <= 0 || set <= rise || set - rise >= 24 * 3600000) {
        continue;
      }
      var noon = rise + (set - rise) / 2;
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
  }

  function parseSolar(daily) {
    var result = [];
    if (!daily || !Array.isArray(daily.sunrise) || !Array.isArray(daily.sunset)) {
      return result;
    }
    for (var i = 0; i < Math.min(daily.sunrise.length, daily.sunset.length); i++) {
      var a = String(daily.sunrise[i] || "");
      var b = String(daily.sunset[i] || "");
      // The API request uses timezone=UTC; convert timestamps to epochs
      // before checking sunset, independent of the TV's own time zone.
      var sunrise = Date.parse(a + (/[zZ]|[+-]\d\d:\d\d$/.test(a) ? "" : "Z"));
      var sunset = Date.parse(b + (/[zZ]|[+-]\d\d:\d\d$/.test(b) ? "" : "Z"));
      if (isFinite(sunrise) && isFinite(sunset) && sunset > sunrise) {
        result.push({ sunrise: sunrise, sunset: sunset });
      }
    }
    return result;
  }

  function refresh() {
    cancelRequests();
    var version = requestVersion,
      opt = options();
    publish(); // Convert a matching cached reading while fetching the selected unit.
    if (!opt.fetch) {
      stopTimer();
      return;
    }
    requestOptions = opt;
    lastRefresh = { source: opt.source, unit: opt.unit, at: Date.now() };
    function current() {
      var now = options();
      return now.fetch && version === requestVersion && now.source === opt.source && now.unit === opt.unit;
    }
    function forecast(geo) {
      if (!current() || !validLocation(geo)) {
        return;
      }
      var f = opt.unit === "F";
      getJSON(
        "https://api.open-meteo.com/v1/forecast?latitude=" +
          geo.latitude +
          "&longitude=" +
          geo.longitude +
          "&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=UTC&forecast_days=2" +
          (f ? "&temperature_unit=fahrenheit" : ""),
        function (m) {
          if (
            !current() ||
            !m ||
            m.error ||
            !m.current ||
            !number(m.current.temperature_2m) ||
            !number(m.current.weather_code)
          ) {
            return;
          }
          reading = {
            temp: m.current.temperature_2m,
            code: m.current.weather_code,
            city: geo.name || geo.city || "",
            day: m.current.is_day,
            solar: parseSolar(m.daily),
            unit: opt.unit,
            source: opt.source,
            at: Date.now(),
          };
          try {
            localStorage.setItem(CACHE, JSON.stringify(reading));
          } catch (e) {}
          publish();
        },
        true
      );
    }
    if (opt.geo) {
      forecast(opt.geo);
    } else {
      getJSON("https://ipapi.co/json/", forecast, true);
    }
  }

  function searchLocations(query, cb) {
    query = query.trim();
    if (query.length < 2) {
      cb([]);
      return;
    }
    getJSON(
      "https://geocoding-api.open-meteo.com/v1/search?name=" +
        encodeURIComponent(query) +
        "&count=5&language=en&format=json",
      function (data) {
        if (!data || data.error || (data.results && !Array.isArray(data.results))) {
          cb(null);
          return;
        }
        cb(
          (data.results || [])
            .filter(function (geo) {
              return validLocation(geo) && typeof geo.name === "string" && geo.name.trim();
            })
            .map(function (geo) {
              var parts = [geo.name];
              [geo.admin2, geo.admin1, geo.country].forEach(function (part) {
                if (typeof part === "string" && part && parts.indexOf(part) < 0) {
                  parts.push(part);
                }
              });
              return {
                name: geo.name,
                label: parts.join(", "),
                latitude: geo.latitude,
                longitude: geo.longitude,
                country_code: geo.country_code || "",
              };
            })
        );
      }
    );
  }

  function updateVisibility() {
    var opt = options();
    if (!opt.fetch) {
      stopTimer();
      cancelRequests();
    }
    publish();
    if (opt.fetch) {
      var now = Date.now();
      var pending =
        automaticRequests.length &&
        requestOptions &&
        requestOptions.source === opt.source &&
        requestOptions.unit === opt.unit;
      var needsSolar = opt.wallpaper && (!validReading(reading, opt) || !solarPhase(reading, now));
      // Reuse an in-flight forecast, and bound retries after failure or missing
      // solar fields to the existing cadence rather than each settings render.
      var retryDue =
        !lastRefresh ||
        lastRefresh.source !== opt.source ||
        lastRefresh.unit !== opt.unit ||
        now < lastRefresh.at ||
        now - lastRefresh.at >= REFRESH;
      var stale =
        timer === null && (!validReading(reading, opt) || reading.unit !== opt.unit || now - reading.at >= REFRESH);
      if (!pending && (stale || needsSolar) && (!opt.wallpaper || retryDue)) {
        refresh();
      }
      if (timer === null) {
        timer = setInterval(refresh, REFRESH);
      }
    }
  }

  function start(settingsGetter) {
    stopTimer();
    cancelRequests();
    if (settingsGetter) {
      settingsOf = settingsGetter;
    }
    try {
      reading = JSON.parse(localStorage.getItem(CACHE));
    } catch (e) {
      reading = null;
    }
    updateVisibility();
  }

  return {
    getSnapshot: getSnapshot,
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    start: start,
    refresh: refresh,
    updateDisplay: publish,
    updateVisibility: updateVisibility,
    searchLocations: searchLocations,
    solarPhase: solarPhase,
    currentReading: function () {
      return validReading(reading, options()) ? reading : null;
    },
  };
})();
