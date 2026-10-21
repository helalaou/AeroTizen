// Localised date styles and system time in the top bar.
(function (A) {
  'use strict';

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                'September', 'October', 'November', 'December'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function systemFormat(method, short) {
    try {
      var time = window.tizen && window.tizen.time;
      if (time && typeof time[method] === 'function') { return time[method](short); }
    } catch (e) { /* older TVs may not expose the system format */ }
    return '';
  }

  function localFormatter(options) {
    var nav = window.navigator || {};
    return new window.Intl.DateTimeFormat(nav.languages || nav.language || undefined, options);
  }

  function localFormat(d, options) {
    return localFormatter(options).format(d);
  }

  function numericDate(d, omitYear) {
    // Tizen short-date tokens: d = day, m = month, y = year.
    var pattern = systemFormat('getDateFormat', true);
    var options = { month: '2-digit', day: '2-digit' };
    if (!omitYear) { options.year = /\byy\b/.test(pattern) ? '2-digit' : 'numeric'; }
    if (typeof pattern === 'string' && /^[dmy\s/.,-]+$/.test(pattern) &&
        /d/.test(pattern) && /m/.test(pattern) && /y/.test(pattern)) {
      if (omitYear) {
        // Remove the year and its adjacent separator, keeping local day/month order.
        pattern = pattern.replace(/^[\s/.,-]*y+[\s/.,-]*|[\s/.,-]*y+[\s/.,-]*$/g, '')
          .replace(/y+[\s/.,-]*/g, '');
      }
      try {
        var formatter = localFormatter(options), parts = {};
        // TV patterns describe Gregorian fields. Other calendars can require eras
        // or named months, so keep their complete locale format intact.
        if (typeof formatter.formatToParts !== 'function' || formatter.resolvedOptions().calendar !== 'gregory') {
          return formatter.format(d);
        }
        formatter.formatToParts(d).forEach(function (part) { parts[part.type] = part.value; });
        if (parts.day && parts.month && !parts.era && (omitYear || parts.year)) {
          return pattern.replace(/d+|m+|y+/g, function (token) {
            return parts[token.charAt(0) === 'd' ? 'day' : token.charAt(0) === 'm' ? 'month' : 'year'];
          });
        }
        return formatter.format(d);
      } catch (e) { /* no locale support: keep the system pattern readable */ }
      return pattern.replace(/d+|m+|y+/g, function (token) {
        if (token.charAt(0) === 'd') { return pad(d.getDate()); }
        if (token.charAt(0) === 'm') { return pad(d.getMonth() + 1); }
        return token.length === 2 ? pad(d.getFullYear() % 100) : String(d.getFullYear());
      });
    }
    try { return localFormat(d, options); }
    catch (e) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + (omitYear ? '' : '/' + d.getFullYear()); }
  }

  function readableDate(d, style) {
    var options = { day: 'numeric', month: style === 'long' ? 'long' : 'short' };
    if (style !== 'compact') { options.weekday = style === 'long' ? 'long' : 'short'; }
    try { return localFormat(d, options); }
    catch (e) {
      // Older TVs without Intl keep readable labels and the system's date order.
      var month = MONTHS[d.getMonth()], weekday = DAYS[d.getDay()];
      if (style !== 'long') { month = month.slice(0, 3); weekday = weekday.slice(0, 3); }
      var pattern = systemFormat('getDateFormat', true);
      var monthFirst = typeof pattern === 'string' && /m.*d/.test(pattern);
      var date = monthFirst ? month + ' ' + d.getDate() : d.getDate() + ' ' + month;
      return style === 'compact' ? date : weekday + ', ' + date;
    }
  }

  function dateStyle(id) {
    // Keep saved choices from earlier versions selected in the new style list.
    if (id === 'auto' || id === 'weekday') { return 'short'; }
    if (id === 'dmy' || id === 'mdy') { return 'numeric'; }
    return id;
  }

  function defaultTimeFormat() {
    var pattern = systemFormat('getTimeFormat');
    if (typeof pattern === 'string' && /h/.test(pattern) && /m/.test(pattern)) {
      return /ap/.test(pattern) ? '12' : '24';
    }
    try {
      var options = localFormatter({ hour: 'numeric', minute: '2-digit' }).resolvedOptions();
      if (typeof options.hour12 === 'boolean') { return options.hour12 ? '12' : '24'; }
    } catch (e) { /* no locale support: retain the original 12-hour default */ }
    return '12';
  }

  // Styles control detail; the locale controls language, order, and punctuation.
  var DATE_FORMATS = [
    { id: 'compact', format: function (d) { return readableDate(d, 'compact'); } },
    { id: 'short', format: function (d) { return readableDate(d, 'short'); } },
    { id: 'long', format: function (d) { return readableDate(d, 'long'); } },
    { id: 'numeric-short', format: function (d) { return numericDate(d, true); } },
    { id: 'numeric', format: numericDate },
    { id: 'iso', format: function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); } },
    { id: 'none', format: function () { return ''; } }
  ];

  function formatDate(d, id) {
    id = dateStyle(id);
    for (var i = 0; i < DATE_FORMATS.length; i++) { if (DATE_FORMATS[i].id === id) { return DATE_FORMATS[i].format(d); } }
    return readableDate(d, 'short');
  }

  function formatTime(d, id) {
    try {
      var cycle = id === '24' ? 'h23' : 'h12';
      var formatter = localFormatter({ hour: id === '24' ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: cycle });
      if (formatter.resolvedOptions().hourCycle === cycle) { return formatter.format(d); }
    } catch (e) { /* older TVs keep the chosen format without Intl */ }
    if (id === '24') { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    return (d.getHours() % 12 || 12) + ':' + pad(d.getMinutes()) + (d.getHours() < 12 ? ' am' : ' pm');
  }

  function tick() {
    var d = new Date(), dateEl = A.$('date'), timeEl = A.$('time');
    dateEl.textContent = formatDate(d, A.settings.dateFormat);
    dateEl.hidden = A.settings.dateFormat === 'none';
    timeEl.setAttribute('data-format', A.settings.timeFormat === '24' ? '24' : '12');
    timeEl.textContent = formatTime(d, A.settings.timeFormat);
  }

  A.clock = {
    DATE_FORMATS: DATE_FORMATS,
    dateStyle: dateStyle,
    defaultTimeFormat: defaultTimeFormat,
    formatDate: formatDate,
    formatTime: formatTime,
    tick: tick,
    start: function () { tick(); setInterval(tick, 10000); }
  };
})(window.AeroTizen);
