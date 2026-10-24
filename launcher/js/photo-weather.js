// Static photographic weather wallpapers adapted from the verified V992.56
// reference. All nine photos are local; the existing Open-Meteo weather cache
// supplies the conditions. No additional network request or animation loop.
(function (A) {
  'use strict';

  var SCENES = { sun: 1, partly: 1, cloud: 1, rain: 1, storm: 1,
    snow: 1, fog: 1, night: 1, sunset: 1 };
  var layer = document.getElementById('weather-photo');
  var scene = '', timer = null;

  function localPhoto(code, isDay) {
    // The is_day field applies to every WMO code, including rain and snow.
    if (isDay === 0 || isDay === '0') { return 'night'; }
    var c = Number(code);
    if (c === 0 || c === 1) { return 'sun'; }
    if (c === 2) { return 'partly'; }
    if (c === 3) { return 'cloud'; }
    if (c === 45 || c === 48) { return 'fog'; }
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) { return 'snow'; }
    if (c >= 95) { return 'storm'; }
    if (c >= 51) { return 'rain'; }
    return 'cloud';
  }

  function solarPhase(reading, now) {
    if (!reading || !Array.isArray(reading.solar) || !reading.solar.length ||
        typeof reading.at !== 'number' || now - reading.at > 36 * 3600000) {
      return '';
    }
    var earliest = Infinity, latest = -Infinity;
    for (var i = 0; i < reading.solar.length; i++) {
      var day = reading.solar[i] || {};
      var rise = Number(day.sunrise), set = Number(day.sunset);
      if (!isFinite(rise) || !isFinite(set) || set <= rise) { continue; }
      if (rise < earliest) { earliest = rise; }
      if (set > latest) { latest = set; }
      if (now >= set - 45 * 60000 && now < set + 20 * 60000) {
        return 'sunset';
      }
      if (now >= rise - 10 * 60000 && now < set - 45 * 60000) {
        return 'day';
      }
    }
    if (earliest !== Infinity && now >= earliest - 18 * 3600000 &&
        now <= latest + 18 * 3600000) { return 'night'; }
    return '';
  }

  function sceneFor(reading, now) {
    if (!reading || typeof reading.code !== 'number' || !isFinite(reading.code)) {
      return '';
    }
    var phase = solarPhase(reading, now);
    if (phase === 'night') { return 'night'; }
    if (phase === 'sunset' &&
        (reading.code === 0 || reading.code === 1 || reading.code === 2)) {
      return 'sunset';
    }
    // Solar timestamps supersede an old is_day reading, but only when
    // the forecast contains trustworthy data for the current location.
    return localPhoto(reading.code, phase === 'day' || phase === 'sunset' ? 1 : reading.day);
  }

  function hide() {
    if (!layer) { return; }
    scene = '';
    layer.style.backgroundImage = '';
    layer.className = 'weather-photo';
    layer.hidden = true;
  }

  function update() {
    if (!layer || !A.settings || !A.settings.weatherPhoto ||
        (document.body.classList && document.body.classList.contains('tv'))) {
      hide(); return false;
    }
    var reading = window.Weather && window.Weather.currentReading &&
      window.Weather.currentReading();
    var next = sceneFor(reading, Date.now()) || scene;
    if (!next || !SCENES[next]) { return false; }
    if (next !== scene) {
      layer.style.backgroundImage = 'url("assets/weather/' + next + '.jpg")';
      scene = next;
    }
    layer.hidden = false;
    layer.className = 'weather-photo active scene-' + scene;
    if (window.Backgrounds && window.Backgrounds.suspend) { window.Backgrounds.suspend(); }
    return true;
  }

  function start() {
    if (timer !== null) { return; }
    // Only one low-frequency time check, needed when the solar phase changes
    // without a new Open-Meteo result (e.g. sunset or after midnight).
    timer = setInterval(function () {
      if (!document.hidden && A.settings.weatherPhoto) { update(); }
    }, 60000);
  }

  function select(enabled) {
    A.settings.weatherPhoto = enabled === true;
    A.settings.save();
    if (A.applyBackground) { A.applyBackground(); }
    if (window.Weather && window.Weather.updateVisibility) {
      window.Weather.updateVisibility();
    }
  }

  A.photoWeather = {
    update: update, hide: hide, start: start, select: select,
    sceneFor: sceneFor, solarPhase: solarPhase
  };
})(window.AeroTizen);
