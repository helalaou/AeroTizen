// User preferences, persisted in localStorage (per-TV, survives app updates).
(function (A) {
  'use strict';

  var cfg = A.config;
  var settings = A.settings = {};

  function defaults() { return JSON.parse(JSON.stringify(cfg.DEFAULTS)); }

  function defaultTempUnit() {
    var nav = window.navigator || {};
    var locales = nav.languages && nav.languages.length ? nav.languages : [nav.language];
    for (var i = 0; i < locales.length; i++) {
      if (typeof locales[i] !== 'string' || !locales[i]) { continue; }
      var tag = locales[i].replace(/_/g, '-').toLowerCase();
      var tokens = tag.split('-'), extension = '';
      for (var j = 1; j < tokens.length; j++) {
        if (tokens[j] === 'x') { break; }
        if (tokens[j] !== 'u') { continue; }
        for (j++; j < tokens.length && tokens[j].length > 1; j++) { extension += '-' + tokens[j]; }
        break;
      }
      // Unicode locale preferences can explicitly override temperature or region.
      var unit = extension.match(/-mu-(celsius|fahrenhe)(?:-|$)/);
      if (unit) { return unit[1] === 'fahrenhe' ? 'F' : 'C'; }
      var override = extension.match(/-rg-([a-z]{2}|\d{3})zzzz(?:-|$)/);
      var region = tag.split(/-[a-z0-9]-/)[0].match(/-([a-z]{2}|\d{3})(?:-|$)/);
      region = override ? override[1] : region ? region[1] : '';
      if (!region) {
        try { region = new window.Intl.Locale(tag).maximize().region || ''; }
        catch (e) { /* older TVs can still read explicit regions above */ }
      }
      if (!region) { continue; }
      // Unicode CLDR weather-unit preferences; other regions use Celsius.
      // https://github.com/unicode-org/cldr/blob/main/common/supplemental/units.xml
      return /^(BS|BZ|KY|PR|PW|US)$/.test(region.toUpperCase()) ? 'F' : 'C';
    }
    return 'C';
  }

  settings.load = function () {
    var data = defaults();
    try {
      var raw = localStorage.getItem(cfg.STORAGE_KEY);
      for (var i = 0; !raw && i < cfg.LEGACY_STORAGE_KEYS.length; i++) {
        raw = localStorage.getItem(cfg.LEGACY_STORAGE_KEYS[i]);
      }
      var saved = raw ? JSON.parse(raw) : {};
      if (saved.favorites && !saved.home) { saved.home = saved.favorites; }  // earlier field name
      Object.keys(data).forEach(function (k) { if (saved[k] !== undefined) { data[k] = saved[k]; } });
    } catch (e) { /* corrupt or unavailable storage: keep defaults */ }
    var detectTimeFormat = data.timeFormat !== '12' && data.timeFormat !== '24';
    var detectTempUnit = data.tempUnit !== 'C' && data.tempUnit !== 'F';
    if (detectTimeFormat) { data.timeFormat = A.clock.defaultTimeFormat(); }
    if (detectTempUnit) { data.tempUnit = defaultTempUnit(); }
    Object.keys(data).forEach(function (k) { settings[k] = data[k]; });
    // Resolve older Automatic settings once, then retain the selected option.
    if (detectTimeFormat || detectTempUnit) { settings.save(); }
  };

  settings.save = function () {
    var out = {};
    Object.keys(cfg.DEFAULTS).forEach(function (k) { out[k] = settings[k]; });
    try { localStorage.setItem(cfg.STORAGE_KEY, JSON.stringify(out)); } catch (e) { /* storage full or blocked */ }
  };
})(window.AeroTizen);
