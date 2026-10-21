// The Settings sheet: backgrounds (+ speed slider and preview), weather, date and
// time formats, input names, which apps show on the home screen, and a tucked-away escape
// back to Samsung Home.
(function (A) {
  'use strict';

  var cfg = A.config, KEY = cfg.KEY, S = A.settings;
  var open = false, previewing = false, eRow = 0, eCol = [], focusKey = null;
  var weatherQuery = '', weatherResults = [], weatherMessage = '', weatherSearchVersion = 0;

  function pill(key, text, selected, onSelect) {
    var p = A.el('div', 'pill unit' + (selected ? ' on' : ''), text);
    p.dataset.key = key;
    p.onclick = onSelect;
    return p;
  }

  function changed(after) { S.save(); if (after) { after(); } render(); }

  // ---- sections ------------------------------------------------------------------
  function renderBackgrounds() {
    var anim = A.$('bg-anim'), still = A.$('bg-still'), selected = null;
    anim.textContent = ''; still.textContent = '';
    window.Backgrounds.list.forEach(function (b) {
      var sw = A.el('div', 'swatch' + (b.id === S.background ? ' on' : ''));
      sw.style.background = window.Backgrounds.preview(b);
      sw.appendChild(A.el('span', '', b.name));
      sw.dataset.key = 'bg:' + b.id;
      sw.onclick = function () { S.background = b.id; changed(A.applyBackground); };
      (b.anim ? anim : still).appendChild(sw);
      if (b.id === S.background) { selected = b; }
    });

    // The speed slider only exists for animated backgrounds, right under them.
    var row = A.$('speed-row'), animated = !!(selected && selected.anim);
    row.hidden = !animated; row.textContent = '';
    if (!animated) { return; }
    var pct = (S.speed - cfg.SPEED.MIN) / (cfg.SPEED.MAX - cfg.SPEED.MIN) * 100;
    var slider = A.el('div', 'slider');
    slider.dataset.key = 'speed';
    slider.innerHTML = '<span class="slider-label">Speed</span><div class="track"><div class="fill"></div><div class="thumb"></div></div>' +
                       '<span class="slider-value"></span><span class="slider-hint">◀ ▶</span>';
    slider.querySelector('.fill').style.width = pct + '%';
    slider.querySelector('.thumb').style.left = pct + '%';
    slider.querySelector('.slider-value').textContent = String(S.speed) + '×';
    slider.adjust = function (dir) {
      var next = S.speed + dir * cfg.SPEED.STEP;
      S.speed = Math.round(Math.max(cfg.SPEED.MIN, Math.min(cfg.SPEED.MAX, next)) * 100) / 100;
      changed(function () { window.Backgrounds.setSpeed(S.speed); });
    };
    row.appendChild(slider);
    row.appendChild(pill('preview', '▶  Preview', false, startPreview));
  }

  function renderWeatherResults() {
    var box = A.$('weather-results'), status = A.$('weather-search-status');
    status.textContent = weatherMessage; status.hidden = !weatherMessage;
    box.textContent = ''; box.hidden = !weatherResults.length;
    weatherResults.forEach(function (geo, i) {
      box.appendChild(pill('weather:result:' + i, geo.label, false, function () {
        S.weatherLocation = geo;
        weatherSearchVersion++; weatherResults = []; weatherMessage = '';
        focusKey = 'weather:query';
        changed(window.Weather.refresh);
      }));
    });
  }

  function searchWeather() {
    var query = weatherQuery.trim(), version = ++weatherSearchVersion;
    weatherResults = [];
    weatherMessage = query.length < 2 ? 'Enter at least two characters, then select Search.' : 'Searching…';
    focusKey = 'weather:search';
    renderWeather(); focus();
    if (query.length < 2) { return; }
    window.Weather.searchLocations(query, function (results) {
      if (!open || version !== weatherSearchVersion) { return; }
      weatherResults = results || [];
      weatherMessage = results === null ? 'Could not search. Check your connection and try again.' :
        results.length ? 'Select your location. Add a region or country to the search if needed.' :
        'No locations found. Try a nearby town or add a region or country.';
      renderWeatherResults(); focus();
    });
  }

  function renderWeather() {
    var box = A.$('weather-location'), visibility = A.$('weather-visibility');
    A.$('weather-location-summary').textContent = S.weatherLocation ?
      'Location: ' + (S.weatherLocation.label || S.weatherLocation.name) :
      'Automatic location uses your internet address and can be inaccurate. Search for your town, city or postcode to set it.';
    box.textContent = ''; visibility.textContent = '';
    box.appendChild(pill('weather:auto', 'Automatic', !S.weatherLocation, function () {
      S.weatherLocation = null;
      weatherSearchVersion++; weatherResults = []; weatherMessage = '';
      focusKey = 'weather:auto';
      changed(window.Weather.refresh);
    }));
    var search = A.el('div', 'pill unit name-pill weather-search'), field = A.el('input');
    search.dataset.key = 'weather:query';
    field.type = 'text'; field.maxLength = 80; field.value = weatherQuery;
    field.placeholder = 'Town, city or postcode';
    field.setAttribute('aria-label', 'Weather location');
    field.oninput = function () {
      weatherQuery = field.value;
      weatherSearchVersion++; weatherResults = []; weatherMessage = '';
      renderWeatherResults();
    };
    search.appendChild(field);
    search.onclick = function () { focusKey = 'weather:query'; field.focus(); };
    box.appendChild(search);
    box.appendChild(pill('weather:search', 'Search', false, searchWeather));
    [true, false].forEach(function (show) {
      visibility.appendChild(pill('weather:show:' + show, show ? 'Show location' : 'Hide location',
        S.weatherShowLocation === show, function () { S.weatherShowLocation = show; changed(window.Weather.updateDisplay); }));
    });
    renderWeatherResults();
  }

  function renderUnits() {
    var units = A.$('units');
    units.textContent = '';
    [['auto', 'Automatic'], ['F', '°F  Fahrenheit'], ['C', '°C  Celsius']].forEach(function (u) {
      units.appendChild(pill('unit:' + u[0], u[1], S.tempUnit === u[0], function () { S.tempUnit = u[0]; changed(window.Weather.refresh); }));
    });
  }

  function renderDateTime() {
    var now = new Date(), times = A.$('time-formats'), dates = A.$('date-formats');
    times.textContent = ''; dates.textContent = '';
    [['12', '(12-hour)'], ['24', '(24-hour)']].forEach(function (t) {
      times.appendChild(pill('time:' + t[0], A.clock.formatTime(now, t[0]) + '  ' + t[1], S.timeFormat === t[0],
        function () { S.timeFormat = t[0]; changed(A.clock.tick); }));
    });
    A.clock.DATE_FORMATS.forEach(function (f) {
      dates.appendChild(pill('date:' + f.id, f.id === 'none' ? 'No date' : f.format(now), S.dateFormat === f.id,
        function () { S.dateFormat = f.id; changed(A.clock.tick); }));
    });
  }

  // OK opens the TV's on-screen keyboard; an empty name falls back to the TV's own name.
  function renderInputNames() {
    var box = A.$('input-names');
    box.textContent = '';
    A.inputs.sources.filter(function (s) { return s.type !== 'TV'; }).forEach(function (s) {
      var port = A.inputs.portName(s), p = A.el('div', 'pill unit name-pill');
      p.dataset.key = 'name:' + port;
      p.appendChild(A.el('span', 'port', port));
      var field = A.el('input');
      field.type = 'text'; field.maxLength = 24;
      field.value = S.inputNames[port] || '';
      field.placeholder = s.editName || 'Add a name';
      field.onchange = field.onblur = function () {
        var v = field.value.trim();
        if (v) { S.inputNames[port] = v; } else { delete S.inputNames[port]; }
        S.save(); A.inputs.render();
      };
      p.appendChild(field);
      p.onclick = function () { field.focus(); };
      box.appendChild(p);
    });
  }

  // Every real app on the TV; OK shows or hides it on the home screen.
  function renderAppMenu() {
    var box = A.$('all-apps');
    box.textContent = '';
    var add = A.el('div', 'tile addapps');
    add.dataset.key = 'add';
    add.innerHTML = A.tiles.ICONS.plus + '<div class="name">Add apps<div class="sub">Samsung app store</div></div>';
    add.onclick = A.apps.openStore;
    box.appendChild(add);
    A.apps.all.forEach(function (app) {
      var tile = A.tiles.banner(app, S.home.indexOf(app.id) >= 0 ? 'on' : '');
      tile.dataset.key = 'app:' + app.id;
      tile.onclick = function () {
        var i = S.home.indexOf(app.id);
        if (i >= 0) { S.home.splice(i, 1); } else { S.home.push(app.id); }
        tile.classList.toggle('on', i < 0);
        S.save();
      };
      box.appendChild(tile);
    });
  }

  function render() {
    renderBackgrounds(); renderWeather(); renderUnits(); renderDateTime(); renderInputNames(); renderAppMenu();
    focus();
  }

  // ---- navigation (focus follows the item, so re-renders don't make it jump) -------
  function editorRows() {
    function kids(id) { return [].slice.call(A.$(id).children); }
    var r = A.chunk(kids('bg-anim'), 8);
    if (!A.$('speed-row').hidden) { r.push(kids('speed-row')); }
    var results = kids('weather-results').map(function (el) { return [el]; });
    return r.concat(A.chunk(kids('bg-still'), 8), [kids('weather-location')], results, [kids('weather-visibility')],
      [kids('units')], [kids('time-formats')], [kids('date-formats')],
      [kids('input-names')], A.chunk(kids('all-apps'), 5), [[A.$('escape')]]).filter(function (row) { return row.length; });
  }

  function focus() {
    A.clearFocus();
    var r = editorRows();
    if (focusKey) {
      for (var i = 0; i < r.length; i++) {
        for (var j = 0; j < r[i].length; j++) { if (r[i][j].dataset.key === focusKey) { eRow = i; eCol[i] = j; } }
      }
    }
    eRow = Math.max(0, Math.min(eRow, r.length - 1));
    eCol[eRow] = Math.max(0, Math.min(eCol[eRow] || 0, r[eRow].length - 1));
    var el = r[eRow][eCol[eRow]];
    el.classList.add('focused');
    focusKey = el.dataset.key || null;
    A.$('editor').scrollTop = Math.max(0, el.offsetTop - 640);
  }

  function startPreview() {
    previewing = true;
    document.body.classList.add('previewing');
    A.clearFocus();
    A.toast('Previewing. Press any key to return');
  }

  function keydown(k, e) {
    if (previewing) {
      e.preventDefault(); previewing = false;
      document.body.classList.remove('previewing'); A.hideToast(); focus();
      return;
    }
    if (k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); return close(); }
    var r = editorRows(), cur = r[eRow] && r[eRow][eCol[eRow] || 0];
    if (cur && cur.adjust && (k === KEY.LEFT || k === KEY.RIGHT)) { return cur.adjust(k === KEY.LEFT ? -1 : 1); }
    if (k === KEY.ENTER) {
      focusKey = cur && cur.dataset.key;
      if (cur === A.$('escape')) { A.homewatch.useSamsungHome(); } else if (cur && cur.onclick) { cur.onclick(); }
      return;
    }
    focusKey = null;
    var c = eCol[eRow] || 0;
    if (k === KEY.LEFT) { eCol[eRow] = c - 1; } else if (k === KEY.RIGHT) { eCol[eRow] = c + 1; } else if (k === KEY.UP) { eRow--; eCol[eRow] = c; } else if (k === KEY.DOWN) { eRow = Math.min(r.length - 1, eRow + 1); eCol[eRow] = c; }
    focus();
  }

  function openSheet() {
    open = true; eRow = 0; eCol = []; focusKey = 'bg:' + S.background;
    document.body.classList.add('editing');
    A.$('editor').hidden = false;
    render();
  }

  function close() {
    open = false;
    weatherSearchVersion++; weatherResults = []; weatherMessage = '';
    document.body.classList.remove('editing');
    A.$('editor').hidden = true;
    S.save();
    A.homeScreen.render();
  }

  A.settingsUi = { open: openSheet, close: close, isOpen: function () { return open; }, focus: focus, keydown: keydown };
})(window.AeroTizen);
