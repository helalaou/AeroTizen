// Optional, read-only Samsung Continue Watching feeds. No root or account login.
(function (A) {
  'use strict';

  var cw = A.continueWatching = { sources: [], items: [], message: '' };
  var listeners = [], requests = [], timers = [], generation = 0, started = false, signature = '';
  var feeds = Object.create(null), startupUntil = 0, clockWall = 0, clockElapsed = 0;
  var CLOCK_CHANGE_MS = 1000;
  var STARTUP_RETRIES = [2000, 5000, 15000, 30000, 60000, 60000, 60000, 60000], REFRESH_RETRIES = [2000, 2000];
  var PREFIX = 'http://samsung.com/tv/metadata/';
  var ENDPOINT = 'http://localhost:9013/?module=EBHelper&func=GetItems';

  // A cold TV can correct its date after launch. Retry limits use elapsed time.
  function retryTime() {
    return window.performance && window.performance.now ? window.performance.now() : Date.now();
  }

  cw.subscribe = function (listener) {
    listeners.push(listener);
    return function () { var i = listeners.indexOf(listener); if (i >= 0) { listeners.splice(i, 1); } };
  };
  function publish() { listeners.slice().forEach(function (listener) { listener(); }); }
  function later(fn, delay) {
    var timer = setTimeout(function () { var i = timers.indexOf(timer); if (i >= 0) { timers.splice(i, 1); } fn(); }, delay);
    timers.push(timer);
  }
  function cancel() {
    generation++;
    timers.forEach(clearTimeout); timers = [];
    var pending = requests; requests = [];
    pending.forEach(function (xhr) { xhr.abort(); });
  }

  // Hidden companion services can declare support for their foreground package.
  // Resolve store IDs by exact installed identity; never join on display names.
  cw.discover = function (inventory) {
    var groups = Object.create(null), found = [];
    inventory.forEach(function (app) {
      var key = app.packageId || app.id;
      if (!groups[key]) { groups[key] = { apps: [], supported: false }; }
      groups[key].apps.push(app);
      try {
        var metadata = A.tizen.application.getAppMetaData(app.id);
        groups[key].supported = groups[key].supported || metadata.some(function (entry) {
          return entry && ((entry.key === PREFIX + 'app_support_continue_watching' && entry.value === 'true') ||
            (entry.key === PREFIX + 'use.continue_watching' && entry.value === 'bg_service'));
        });
      } catch (e) { /* unavailable metadata does not establish support */ }
    });
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (!group.supported) { return; }
      var foreground = group.apps.filter(function (app) { return app.show !== false && app.name && !A.config.HIDDEN_APPS.test(app.id); });
      if (!foreground.length) { return; }
      foreground.sort(function (a, b) { return Number(!!A.catalog.storeId(b.id)) - Number(!!A.catalog.storeId(a.id)); });
      var app = foreground[0], storeId = A.catalog.storeId(app.id);
      found.push({ id: app.id, name: A.tiles.shortName(app.name), icon: app.iconPath || '', storeId: storeId || '', status: storeId ? 'Not selected' : 'App ID unavailable' });
    });
    return found.sort(function (a, b) { return a.name.localeCompare(b.name); });
  };

  function text(value, limit) { return typeof value === 'string' ? value.slice(0, limit) : ''; }
  function nonnegative(value) { return typeof value === 'number' && isFinite(value) && value >= 0 ? value : 0; }
  function activity(value) {
    value = nonnegative(value);
    if (value > 100000000000) { value /= 1000; }
    // Reject invalid/future values; never substitute expiry, release or fetch time.
    return value > 0 && value <= Date.now() / 1000 + 86400 ? value : 0;
  }
  cw.normalize = function (source, records) {
    if (!Array.isArray(records)) { throw new Error('Invalid feed'); }
    var byId = Object.create(null), result = [];
    records.slice(0, 200).forEach(function (record) {
      if (!record || String(record.app_id) !== source.storeId) { return; }
      var title = text(record.content_title, 300), id = text(record.content_id, 500), payload = text(record.payload, 16000);
      if (!title || !id || !payload || record.content_id.length > 500 || record.payload.length > 16000) { return; }
      var item = { key: source.id + ':' + id, sourceId: source.id, sourceName: source.name, sourceIcon: source.icon || '', title: title,
        season: nonnegative(record.season), episode: nonnegative(record.episode), payload: payload,
        duration: nonnegative(record.duration), playback: nonnegative(record.playback),
        timestamp: activity(record.timestamp), image: /^https?:\/\//i.test(record.image_url) ? text(record.image_url, 4000) : '' };
      var previous = byId[id];
      if (!previous) { byId[id] = item; result.push(item); }
      else if (item.timestamp > previous.timestamp) { result[result.indexOf(previous)] = item; byId[id] = item; }
    });
    // Zero-offset next episodes remain eligible. Old expiry dates are unreliable
    // on tested providers. Distinct episode IDs must not be merged by title.
    return result;
  };
  function merge() {
    var items = [], previous = Object.create(null);
    cw.items.forEach(function (item) { previous[item.key] = item; });
    // Retain bounded source records so a clock correction can revalidate dates.
    cw.sources.forEach(function (source) { items = items.concat(cw.normalize(source, feeds[source.id] || [])); });
    items = items.map(function (item, index) { return { item: item, index: index }; })
      .sort(function (a, b) { return b.item.timestamp - a.item.timestamp || a.index - b.index; })
      .slice(0, 30).map(function (entry) {
        var item = entry.item, old = previous[item.key];
        return old && JSON.stringify(old) === JSON.stringify(item) ? old : item;
      });
    // Status updates and identical reads must not reload card artwork.
    if (items.length !== cw.items.length || items.some(function (item, index) { return item !== cw.items[index]; })) { cw.items = items; }
    publish();
  }
  function checkClock() {
    var wall = Date.now(), elapsed = retryTime();
    var changed = Math.abs(wall - clockWall - (elapsed - clockElapsed)) > CLOCK_CHANGE_MS;
    clockWall = wall; clockElapsed = elapsed;
    if (changed && cw.items.length && A.settings.continueWatching === true && !document.hidden) { merge(); }
  }
  function read(source, token, attempt, warmup) {
    if (token !== generation) { return; }
    var xhr = new XMLHttpRequest(), settled = false, delays = warmup ? STARTUP_RETRIES : REFRESH_RETRIES;
    requests.push(xhr);
    function finish(error, data, records) {
      if (settled) { return; }
      settled = true;
      var index = requests.indexOf(xhr); if (index >= 0) { requests.splice(index, 1); }
      if (token !== generation) { return; }
      // Publishers can become ready after the launcher on a cold TV. Keep a
      // bounded five-minute startup window; settled feeds do not keep polling.
      if (((error && warmup) || (!error && !data.length)) && attempt < delays.length &&
          (!warmup || retryTime() < startupUntil)) {
        source.status = 'Checking for items'; publish();
        var delay = warmup ? Math.min(delays[attempt], startupUntil - retryTime()) : delays[attempt];
        later(function () { read(source, token, attempt + 1, warmup); }, delay);
        return;
      }
      if (error) { source.status = 'Unavailable'; feeds[source.id] = []; merge(); return; }
      feeds[source.id] = records.slice(0, 200);
      source.status = data.length ? data.length + (data.length === 1 ? ' item' : ' items') : 'No items available';
      merge();
    }
    xhr.onload = function () {
      try {
        if (xhr.status !== 200 || xhr.responseText.length > 2000000) { throw new Error('Unavailable feed'); }
        var records = JSON.parse(xhr.responseText);
        finish(null, cw.normalize(source, records), records);
      } catch (e) { finish(true); }
    };
    xhr.onerror = xhr.ontimeout = function () { finish(true); };
    xhr.onabort = function () { finish(true); };
    try {
      // app_id alone is not a cache key. Keep each source and retry fresh.
      var key = source.storeId + '-' + Date.now() + '-' + token + '-' + attempt;
      xhr.open('GET', ENDPOINT + '&_aerotizen=' + encodeURIComponent(key), true);
      xhr.timeout = 5000;
      xhr.setRequestHeader('app_id', source.storeId);
      xhr.send();
    } catch (e) { finish(true); }
  }

  cw.refresh = function () {
    cancel();
    cw.sources = []; cw.message = '';
    if (A.settings.continueWatching !== true) { feeds = Object.create(null); cw.items = []; publish(); return; }
    if (!A.tizen || !A.tizen.application || !A.tizen.application.getAppMetaData) {
      feeds = Object.create(null); cw.items = [];
      cw.message = 'App discovery is available on a Samsung TV.'; publish(); return;
    }
    cw.sources = cw.discover(A.apps.inventory || []);
    cw.message = !A.apps.ready ? 'Finding installed apps…' : !cw.sources.length ? 'No installed apps declare Continue Watching support.' : '';
    var token = generation, warmup = retryTime() < startupUntil, selected = cw.sources.filter(function (source) {
      return source.storeId && A.settings.continueWatchingApps.indexOf(source.id) >= 0;
    });
    Object.keys(feeds).forEach(function (id) {
      if (!selected.some(function (source) { return source.id === id; })) { delete feeds[id]; }
    });
    selected.forEach(function (source) { source.status = 'Checking for items'; });
    merge();
    // Refresh on app discovery, source selection and return to AeroTizen.
    // Startup allows late publishers; ordinary empty results have two retries.
    if (!document.hidden) { selected.forEach(function (source) { read(source, token, 0, warmup); }); }
  };

  cw.open = function (item) {
    if (!A.tizen || !cw.items.some(function (current) { return current === item; })) { return; }
    try {
      var data = [new A.tizen.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: item.payload })])];
      var control = new A.tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null, data);
      A.homewatch.watch(item.sourceId);
      A.tizen.application.launchAppControl(control, item.sourceId, null, function () { A.toast('Could not open ' + item.title); });
    } catch (e) { A.toast('Could not open ' + item.title); }
  };
  cw.start = function () {
    if (started) { return; }
    started = true; clockWall = Date.now(); clockElapsed = retryTime(); startupUntil = clockElapsed + 300000;
    if (A.clock && A.clock.subscribe) { A.clock.subscribe(checkClock); }
    A.apps.subscribe(cw.refresh);
    A.settings.subscribe(function () {
      var next = JSON.stringify([A.settings.continueWatching, A.settings.continueWatchingApps]);
      if (signature !== next) { signature = next; cw.refresh(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancel(); } else { cw.refresh(); }
    });
    signature = JSON.stringify([A.settings.continueWatching, A.settings.continueWatchingApps]);
    cw.refresh();
  };
})(window.AeroTizen);
