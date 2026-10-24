// Port of the independently tested large clock, weather cache renderer, and
// clock style selection. The original upstream header remains the default.
// The source routines are adapted only where the upstream DOM/locale differs.
(function (A) {
  'use strict';
  var S = A.settings;
  var widget = document.getElementById('aero-v991-widget');
  if (!widget) { return; }
  var hours = document.getElementById('aero-v991-hours');
  var minutes = document.getElementById('aero-v991-minutes');
  var date = document.getElementById('aero-v991-date');
  var icon = document.getElementById('aero-v991-weather-icon');
  var temp = document.getElementById('aero-v991-temp');
  var condition = document.getElementById('aero-v991-condition');
  var city = document.getElementById('aero-v991-city');
  var weatherOrigin = document.getElementById('weather');

  // The same four styles and values used in the reference implementation.
  var clockOptions = ['vertical', 'horizontal', 'minimal', 'bold'];
  var clockLayouts = ['classic', 'custom'];
  function clockSetting(key, allowed, fallback) {
    return allowed.indexOf(S[key]) >= 0 ? S[key] : fallback;
  }
  function applyClock() {
    var t = clockSetting('aeroClockStyle', clockOptions, 'vertical');
    widget.classList.remove('style-horizontal', 'style-minimal', 'style-bold');
    if (t !== 'vertical') { widget.classList.add('style-' + t); }
    document.body.classList.toggle('aero-clock-horizontal', t === 'horizontal');
    var classic = clockSetting('clockLayout', clockLayouts, 'classic') === 'classic';
    document.body.classList.toggle('s90c-clock-classic', classic);
    widget.hidden = classic;
    tick();
    refreshWeather();
  }
  function tr(s) { return A.i18n && A.i18n.t ? A.i18n.t(s) : s; }
  function p2(n) { return n < 10 ? '0' + n : String(n); }

  // Source clock update: time/date formatting remains owned by upstream.
  function tick() {
    if (S.clockLayout !== 'custom') { return; }
    var now = new Date();
    var timeFormat = S.timeFormat === '12' ? '12' : '24';
    var dateFormat = S.dateFormat || 'long';
    var time = A.clock && A.clock.formatTime ? A.clock.formatTime(now, timeFormat) :
      (p2(now.getHours()) + ':' + p2(now.getMinutes()));
    var match = /^([0-9]{1,2}):([0-9]{2})(?:\s*(am|pm))?$/i.exec(time);
    var hh = match ? match[1] : p2(now.getHours());
    var mm = match ? match[2] : p2(now.getMinutes());
    var meridiem = match && match[3] ? match[3].toUpperCase() : '';
    hours.textContent = hh;
    minutes.textContent = mm;
    if (meridiem) {
      var marker = document.createElement('span');
      marker.textContent = ' ' + meridiem;
      marker.style.cssText = 'display:inline-block;font-size:.20em;line-height:1;'
        + 'letter-spacing:0;margin-left:4px;font-weight:400;vertical-align:baseline;';
      minutes.appendChild(marker);
    }
    var formattedDate = A.clock && A.clock.formatDate ? A.clock.formatDate(now, dateFormat) : '';
    date.textContent = formattedDate;
    date.style.display = formattedDate && S.dateFormat !== 'none' ? '' : 'none';
    hours.style.display = minutes.style.display = S.showTime === false ? 'none' : '';
    widget.hidden = S.showTime === false && (S.dateFormat === 'none') && S.showWeather === false;
  }

  // Same WMO code mapping as the reference widget, with English labels
  // because English is the upstream source language.
  function describe(c) {
    if (c === 0) { return 'Clear'; }
    if (c === 1) { return 'Mainly clear'; }
    if (c === 2) { return 'Partly cloudy'; }
    if (c === 3) { return 'Cloudy'; }
    if (c === 45 || c === 48) { return 'Fog'; }
    if (c >= 51 && c <= 57) { return 'Drizzle'; }
    if (c >= 61 && c <= 67) { return 'Rain'; }
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) { return 'Snow'; }
    if (c >= 80 && c <= 82) { return 'Showers'; }
    if (c >= 95 && c <= 99) { return 'Thunderstorm'; }
    return 'Weather';
  }
  // Directly uses the reference implementation's existing Open-Meteo cache
  // validation rather than cloning or re-requesting the upstream weather UI.
  function refreshWeather() {
    if (S.clockLayout !== 'custom') { return; }
    var value = null;
    try { value = JSON.parse(localStorage.getItem('aerotizen.weather.v2') || 'null'); }
    catch (e) {}
    var g = S.weatherLocation;
    var source = g && g.name && typeof g.latitude === 'number' && typeof g.longitude === 'number'
      ? JSON.stringify([g.latitude, g.longitude, g.name, g.country_code]) : 'auto';
    var unit = S.tempUnit === 'C' || S.tempUnit === 'F' ? S.tempUnit : 'auto';
    if (!value || value.source !== source || value.unit !== unit ||
        typeof value.at !== 'number' || Date.now() - value.at > 7200000 || Date.now() < value.at) {
      value = null;
    }
    var displayWeather = S.showWeather !== false;
    var parent = icon.parentNode;
    parent.style.display = displayWeather ? '' : 'none';
    city.style.display = displayWeather && S.weatherShowLocation !== false ? '' : 'none';
    if (!displayWeather) { return; }
    if (!value || !isFinite(Number(value.temp))) {
      temp.textContent = '--°';
      condition.textContent = tr('Weather unavailable');
      city.textContent = '';
      icon.textContent = '';
      return;
    }
    temp.textContent = Math.round(Number(value.temp)) + '°';
    condition.textContent = tr(describe(Number(value.code)));
    var oldIcon = weatherOrigin && weatherOrigin.querySelector('svg');
    icon.textContent = '';
    if (oldIcon) { icon.appendChild(oldIcon.cloneNode(true)); }
    city.textContent = S.weatherShowLocation === false ? '' : String(value.city || '');
  }
  function chooseLayout(value) {
    S.clockLayout = clockLayouts.indexOf(value) >= 0 ? value : 'classic';
    S.save();
    applyClock();
  }
  function chooseStyle(value) {
    S.aeroClockStyle = clockOptions.indexOf(value) >= 0 ? value : 'vertical';
    S.save();
    applyClock();
  }
  A.clockLayouts = {
    LAYOUTS: clockLayouts,
    STYLES: clockOptions,
    apply: applyClock,
    update: function () { tick(); },
    refreshWeather: refreshWeather,
    chooseLayout: chooseLayout,
    chooseStyle: chooseStyle
  };
  if (weatherOrigin && window.MutationObserver) {
    var observer = new window.MutationObserver(function () { refreshWeather(); });
    observer.observe(weatherOrigin, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tick(); refreshWeather(); }
  });
})(window.AeroTizen);
