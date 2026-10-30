// Optional AI-generated weather scenes. Reuses Weather; images stay local.
(function (A) {
  'use strict';

  var SCENES = { sun: 1, partly: 1, cloud: 1, rain: 1, storm: 1,
    snow: 1, fog: 1, night: 1, sunset: 1 };
  var layer = document.getElementById('weather-photo');
  var scene = '', pending = '', failed = '', image = null, timer = null, generation = 0, started = false;

  function localPhoto(code) {
    var c = Number(code);
    if (c === 0 || c === 1) { return 'sun'; }
    if (c === 2) { return 'partly'; }
    if (c === 3) { return 'cloud'; }
    if (c === 45 || c === 48) { return 'fog'; }
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) { return 'snow'; }
    if (c === 95 || c === 96 || c === 99) { return 'storm'; }
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) { return 'rain'; }
    return 'cloud';
  }

  function solarPhase(reading, now) {
    return window.Weather && window.Weather.solarPhase ? window.Weather.solarPhase(reading, now) : '';
  }

  function sceneFor(reading, now) {
    if (!reading || typeof reading.code !== 'number' || !isFinite(reading.code)) {
      return '';
    }
    var phase = solarPhase(reading, now);
    // Old is_day values (or a missing value) cannot reliably describe the current
    // phase. Keep the selected background until the shared forecast supplies it.
    if (!phase) { return ''; }
    if (phase === 'night') { return 'night'; }
    if (phase === 'sunset' &&
        (reading.code === 0 || reading.code === 1 || reading.code === 2)) {
      return 'sunset';
    }
    // Solar timestamps supersede an old is_day reading, but only when
    // the forecast contains trustworthy data for the current location.
    return localPhoto(reading.code);
  }

  function cancelImage() {
    generation++;
    if (image) { image.onload = image.onerror = null; }
    image = null;
    pending = '';
  }

  function stopTimer() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  function hide() {
    cancelImage();
    scene = ''; failed = '';
    if (!layer) { return; }
    layer.style.backgroundImage = '';
    layer.className = 'weather-photo';
    layer.hidden = true;
  }

  function update() {
    var enabled = Boolean(layer && A.settings && A.settings.weatherPhoto === true);
    if (!enabled || document.hidden) { stopTimer(); }
    else if (started && timer === null) { timer = setInterval(update, 60000); }
    if (!enabled || (document.body.classList && document.body.classList.contains('tv'))) {
      hide(); return false;
    }
    if (document.hidden) { return Boolean(scene); }
    var reading = window.Weather && window.Weather.currentReading && window.Weather.currentReading();
    var next = sceneFor(reading, Date.now());
    if (!next || !SCENES[next]) {
      var wasActive = Boolean(scene);
      hide();
      // A location change or expired reading must not leave the old city's scene visible.
      if (wasActive && A.applyBackground) { A.applyBackground(); }
      return false;
    }
    if (next === scene || next === pending || next === failed) { return Boolean(scene); }
    cancelImage();
    var token = generation, requested = new Image();
    pending = next;
    image = requested;
    requested.onload = function () {
      if (token !== generation || A.settings.weatherPhoto !== true || document.hidden) { return; }
      image = null; pending = ''; failed = '';
      scene = next;
      layer.style.backgroundImage = 'url("assets/weather/' + next + '.jpg")';
      layer.className = 'weather-photo active scene-' + next;
      layer.hidden = false;
      // Suspend only after decode succeeds: missing assets retain the chosen background.
      if (window.Backgrounds && window.Backgrounds.suspend) { window.Backgrounds.suspend(); }
    };
    requested.onerror = function () {
      if (token !== generation) { return; }
      hide();
      failed = next;
      if (A.applyBackground) { A.applyBackground(); }
    };
    requested.src = 'assets/weather/' + next + '.jpg';
    return Boolean(scene);
  }

  function start() {
    if (started) { return; }
    started = true;
    document.addEventListener('visibilitychange', function () {
      // Discard in-flight callbacks while hidden; refresh solar phase on return.
      if (document.hidden) { cancelImage(); stopTimer(); }
      else { update(); }
    });
    update();
  }

  A.photoWeather = {
    update: update, hide: hide, start: start,
    sceneFor: sceneFor, solarPhase: solarPhase
  };
})(window.AeroTizen);
