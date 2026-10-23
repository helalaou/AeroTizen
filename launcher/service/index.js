'use strict';

// Background watcher that makes the launcher behave like the TV's home screen.
// Hidden web apps are frozen on retail TVs, so this runs as a Tizen web service started at
// boot. It polls the TV's local API (port 8001) and relaunches the launcher when Samsung
// Home covers it, while standing aside for apps opened elsewhere (e.g. a phone cast).
//
// Frame TVs get an extra guard: Art Mode also hides the launcher, so every relaunch there
// needs two fresh "Art Mode off" replies and a recheck of the screen. Other TVs keep the
// fast path (short grace period, direct relaunch). The launcher talks to this service over
// http://127.0.0.1:47790.
var http = require('http');
var createArtMode = require('./artmode');
var SELF = 'DclHome001.Home';
var HIDDEN_GRACE = 250;         // non-Frame: Samsung Home appears almost at once
var FRAME_HIDDEN_GRACE = 1500;  // Frame: give Art Mode time to report before reclaiming
var APP_GRACE = 2500;
var WATCH_STOP_GRACE = 1500;    // a watched app must stay stopped this long before it's dropped
var WATCH_COVER_GRACE = 10000;  // an app the launcher opened may take this long to cover it
var UNSEEN_SCAN = 5000;         // same pace as the visible snapshot: other apps while one is unseen
var BOOT_DELAY = 3000;
var BOOT_FALLBACK = 15000;      // launch anyway if the TV type is still unknown
var started = false;
var stopped = false;
var server = null;
var interval = null;
var capabilityRetry = null;
var busy = false;
var scanNumber = 0;
var pending = null;
var bootUntil = 0;
var bootDone = false;
var bootFallback = null;
var state = {
  watched: null, seen: false, leaving: false,
  apps: [], running: {}, selfVisible: null, hiddenSince: 0,
  watchedHiddenSince: 0, watchAt: 0, lastLaunch: 0, last: null,
  epoch: 0, heartbeats: 0,
  guard: { capability: 'unknown', artMode: 'unknown', pending: null,
    lastBlocked: null, launchCalls: 0, history: [] }
};

function record(kind, detail) {
  state.guard.history.push({ at: Date.now(), kind: kind, detail: detail });
  if (state.guard.history.length > 100) { state.guard.history.shift(); }
}
function block(reason) {
  if (state.guard.lastBlocked !== reason) { record('blocked', reason); }
  state.guard.lastBlocked = reason;
}
function invalidate(reason) {
  state.epoch += 1;
  if (pending) {
    clearTimeout(pending.timer);
    record('cancelled', reason);
  }
  pending = null;
  state.guard.pending = null;
}
// Call whenever state.watched changes: what we learned about the previous app doesn't carry over.
function resetWatchedTiming() {
  state.watchedHiddenSince = 0; state.watchedRan = false; state.watchedStoppedSince = 0;
}
function resetHiddenTiming() {
  state.hiddenSince = 0; state.watchedHiddenSince = 0; state.watchedStoppedSince = 0;
  state.selfVisible = null; state.watchAt = Date.now();
}
function resetTracking() {
  state.watched = null; state.seen = false; resetWatchedTiming(); resetHiddenTiming();
}

var art = createArtMode({ onChange: function (value, reason) {
  var previous = state.guard.artMode;
  state.guard.artMode = value;
  if (value !== 'off' || previous !== 'off') {
    invalidate('Art status: ' + value);
    if (value !== previous) { resetHiddenTiming(); record('art-status', value); }
  }
  if (value !== 'off') { block('Art status: ' + value + ' (' + reason + ')'); }
} });

function get(path, cb) {
  var settled = false, req = null;
  var timer = setTimeout(function () {
    finish(null, false);
    if (req) { req.destroy(); }
  }, 1500);
  function finish(value, unavailable) {
    if (settled) { return; }
    settled = true; clearTimeout(timer); cb(value, unavailable);
  }
  try {
    req = http.get({ host: '127.0.0.1', port: 8001, path: path }, function (res) {
      var body = '';
      res.on('data', function (chunk) {
        body += chunk;
        if (body.length > 65536) { finish(null, false); req.destroy(); }
      });
      res.on('error', function () { finish(null, false); });
      res.on('end', function () {
        if (res.statusCode === 404) { finish(null, true); return; }
        if (res.statusCode !== 200) { finish(null, false); return; }
        var value = null;
        try { value = JSON.parse(body); } catch (e) { /* Invalid data blocks a relaunch. */ }
        finish(value, false);
      });
    });
    req.on('error', function () { finish(null, false); });
  } catch (e) { finish(null, false); }
}
function appStatus(id, cb) {
  get('/api/v2/applications/' + encodeURIComponent(id), function (value, unavailable) {
    var valid = value && typeof value.running === 'boolean' && typeof value.visible === 'boolean';
    cb(valid ? value : null, unavailable);
  });
}
function snapshot(cb) {
  var ids = state.apps.slice(), left = ids.length;
  var result = { running: {}, visible: null, complete: true };
  if (!left) { cb(result); return; }
  ids.forEach(function (id) {
    appStatus(id, function (value, unavailable) {
      if (!value && !unavailable) { result.complete = false; }
      result.running[id] = !!(value && value.running);
      if (value && value.visible) { result.visible = id; }
      left -= 1;
      if (!left) { cb(result); }
    });
  });
}
function standAside(result, knownApp) {
  var id = result.visible;
  if (!id) {
    for (var key in result.running) {
      if (key !== knownApp && result.running[key] && !state.running[key]) { id = key; break; }
    }
  }
  state.running = result.running;
  if (!id) { return false; }
  invalidate('another app is active');
  state.watched = id; state.seen = result.visible === id;
  resetWatchedTiming();
  state.last = 'stand aside: ' + id;
  return true;
}
function isFrame() { return state.guard.capability === 'frame'; }
function hiddenGrace() { return isFrame() ? FRAME_HIDDEN_GRACE : HIDDEN_GRACE; }
function launchNow(why) {
  if (Date.now() - state.lastLaunch < 2000) { return; }
  state.lastLaunch = Date.now(); state.watched = null; state.seen = false;
  state.guard.lastBlocked = null; state.guard.launchCalls += 1;
  record('launch', why);
  try {
    tizen.application.launch(SELF, function () { state.last = 'relaunched: ' + why; },
      function (e) { state.last = 'relaunch failed: ' + (e && e.message); });
  } catch (e) { state.last = 'relaunch threw: ' + e.message; }
}
// Open the launcher once at boot on non-Frame TVs. Frame TVs leave this to the guarded
// watcher, so a Frame booting into Art Mode stays there. If the type never resolves, launch
// anyway: a TV that boots to Samsung Home is worse than a rare Art interruption.
function bootLaunch() {
  if (bootDone || stopped || state.leaving) { return; }
  bootDone = true;
  clearTimeout(bootFallback);
  setTimeout(function () {
    if (state.guard.capability === 'unknown') { launchNow('boot (TV type unknown)'); }
    else if (!isFrame()) { launchSelf('boot'); }
  }, Math.max(0, bootUntil - Date.now()));
}
function permitted() {
  if (state.guard.capability === 'non-frame' || state.guard.capability === 'not-advertised') { return true; }
  if (state.guard.capability !== 'frame') { block('TV capability unknown'); return false; }
  if (state.guard.artMode !== 'off') { block('Art status: ' + state.guard.artMode); return false; }
  return true;
}
function freshOff(cb) {
  if (state.guard.capability === 'non-frame' || state.guard.capability === 'not-advertised') { cb('off'); return; }
  if (state.guard.capability !== 'frame') { cb('unknown'); return; }
  art.fresh(cb);
}
function current(candidate) {
  return !stopped && !state.leaving && pending === candidate &&
    candidate.epoch === state.epoch && candidate.watched === state.watched;
}
function cancel(candidate, reason) {
  if (pending !== candidate) { return; }
  block(reason); invalidate(reason);
}
function recheck(candidate, cb) {
  function ready() {
    if (state.guard.capability !== 'frame') { cb(); return; }
    get('/api/v2/', function (info) {
      if (!current(candidate)) { return; }
      if (!info || !info.device || info.device.PowerState !== 'on') {
        cancel(candidate, 'TV power state unavailable or not on'); return;
      }
      cb();
    });
  }
  appStatus(SELF, function (me) {
    if (!current(candidate)) { return; }
    if (!me || me.visible) { cancel(candidate, 'launcher visible or status unavailable'); return; }
    if (candidate.watched) {
      appStatus(candidate.watched, function (watched) {
        if (!current(candidate)) { return; }
        if (!watched || watched.visible || !state.seen) {
          cancel(candidate, 'watched app visible or status unavailable'); return;
        }
        // Also check other apps: a cast can start while a watched app closes.
        snapshot(function (result) {
          if (!current(candidate)) { return; }
          if (!result.complete) { cancel(candidate, 'app inventory unavailable'); return; }
          if (standAside(result, candidate.watched)) { return; }
          ready();
        });
      });
    } else {
      snapshot(function (result) {
        if (!current(candidate)) { return; }
        if (!result.complete) { cancel(candidate, 'app inventory unavailable'); return; }
        if (standAside(result)) { return; }
        ready();
      });
    }
  });
}
function launchSelf(why) {
  if (pending || state.leaving || stopped || !permitted()) { return; }
  if (!isFrame()) { launchNow(why); return; }
  if (Date.now() - state.lastLaunch < 2000) { return; }
  var candidate = { epoch: state.epoch, watched: state.watched, reason: why, timer: null };
  pending = candidate;
  state.guard.pending = { reason: why, at: Date.now() };
  record('checking', why);
  candidate.timer = setTimeout(function () { cancel(candidate, 'guard deadline'); }, 6000);
  // First read protects the app checks; a second read authorizes the launch itself.
  freshOff(function (value) {
    if (!current(candidate)) { return; }
    if (value !== 'off') { cancel(candidate, 'fresh Art status: ' + value); return; }
    recheck(candidate, function () {
      if (!current(candidate)) { return; }
      freshOff(function (finalValue) {
        if (!current(candidate)) { return; }
        if (finalValue !== 'off' || !permitted()) { cancel(candidate, 'final Art check blocked'); return; }
        // Let a veto frame already buffered after this reply cancel the candidate.
        setTimeout(function () {
          if (!current(candidate) || !permitted()) { return; }
          clearTimeout(candidate.timer); pending = null; state.guard.pending = null;
          state.lastLaunch = Date.now(); state.watched = null; state.seen = false;
          state.guard.lastBlocked = null; state.guard.launchCalls += 1;
          record('launch', why);
          try {
            tizen.application.launch(SELF, function () { state.last = 'relaunched: ' + why; },
              function (e) { state.last = 'relaunch failed: ' + (e && e.message); });
          } catch (e) { state.last = 'relaunch threw: ' + e.message; }
        }, 0);
      });
    });
  });
}

function tick() {
  state.heartbeats += 1;
  if (stopped || state.leaving || busy || pending || Date.now() < bootUntil || !permitted()) { return; }
  busy = true;
  var number = ++scanNumber, epoch = state.epoch, finished = false;
  var watchdog = setTimeout(done, 2000);
  function done() {
    if (finished) { return; }
    finished = true;
    clearTimeout(watchdog);
    if (number === scanNumber) { busy = false; }
  }
  function valid() {
    return !finished && !stopped && !state.leaving && epoch === state.epoch && number === scanNumber;
  }
  appStatus(SELF, function (me) {
    if (!valid() || !me) { done(); return; }
    var now = Date.now();
    if (me.visible) {
      state.selfVisible = true; state.hiddenSince = 0;
      // The launcher stays on screen for a moment after opening an app; keep that watch until the
      // app has had time to cover it. A real return to the launcher resets it through /home.
      if (now - state.watchAt >= WATCH_COVER_GRACE) { state.watched = null; state.seen = false; resetWatchedTiming(); }
      if (now - (state.snapAt || 0) > 5000) {
        state.snapAt = now;
        snapshot(function (result) { if (valid() && (result.complete || !isFrame())) { state.running = result.running; } done(); });
      } else { done(); }
      return;
    }
    if (state.selfVisible !== false) { state.hiddenSince = now; }
    state.selfVisible = false;
    var settling = now - state.hiddenSince < hiddenGrace() || now - state.watchAt < APP_GRACE;
    // Frame waits out the grace period even for a watched app; other TVs check it at once.
    if (settling && isFrame()) { done(); return; }
    if (state.watched) {
      var id = state.watched;
      appStatus(id, function (watched) {
        if (!valid() || state.watched !== id || !watched) { done(); return; }
        if (watched.visible) { state.seen = true; state.watchedHiddenSince = 0; }
        else if (state.seen) {
          if (!state.watchedHiddenSince) { state.watchedHiddenSince = Date.now(); }
          if (!isFrame() || Date.now() - state.watchedHiddenSince >= FRAME_HIDDEN_GRACE) { launchSelf('home pressed in ' + id); }
        } else if (watched.running) {
          state.watchedRan = true; state.watchedStoppedSince = 0;
          if (Date.now() - (state.unseenScanAt || 0) >= UNSEEN_SCAN) {
            // Some apps (YouTube, some third-party players) never report themselves visible.
            // Meanwhile, follow any app that does, e.g. one opened from Samsung Home, so Home in
            // it still returns.
            state.unseenScanAt = Date.now();
            snapshot(function (result) {
              if (valid() && state.watched === id && result.visible && result.visible !== id) {
                record('unseen', id + ' never reported visible; following ' + result.visible);
                standAside(result, id);
              }
              done();
            });
            return;
          }
        } else if (state.watchedRan) {
          // It ran and has stayed stopped, so it closed and can't be covering the launcher.
          // Without this, an app that never reports itself visible held the watcher forever.
          if (!state.watchedStoppedSince) { state.watchedStoppedSince = Date.now(); }
          if (Date.now() - state.watchedStoppedSince >= WATCH_STOP_GRACE) {
            record('unwatched', id + ' stopped running');
            state.watched = null; state.watchedHiddenSince = 0;
          }
        }
        done();
      });
      return;
    }
    if (settling) { done(); return; }
    snapshot(function (result) {
      if (!valid()) { done(); return; }
      // A failed status reads as "not running" except on Frame TVs, where any gap blocks a
      // relaunch. The TV's API can stall for seconds while Samsung Home loads.
      if ((result.complete || !isFrame()) && !standAside(result)) { launchSelf('covered without an app'); }
      done();
    });
  });
}

function discoverCapability() {
  if (stopped) { return; }
  get('/api/v2/', function (info) {
    if (stopped) { return; }
    var device = info && info.device;
    var flag = device && device.FrameTVSupport;
    // Older APIs can omit this optional feature flag. A valid TV response without
    // it keeps the normal watcher; a failed or malformed response does not.
    var validDevice = device && typeof device === 'object' && !Array.isArray(device) &&
      ((typeof device.modelName === 'string' && device.modelName.length > 0) ||
       (typeof device.model === 'string' && device.model.length > 0) ||
       device.PowerState === 'on' || device.PowerState === 'standby' || device.PowerState === 'off');
    var omitted = validDevice && !Object.prototype.hasOwnProperty.call(device, 'FrameTVSupport');
    var capability = flag === true || flag === 'true' ? 'frame' :
      flag === false || flag === 'false' ? 'non-frame' : omitted ? 'not-advertised' : 'unknown';
    state.guard.capability = capability;
    record('capability', capability);
    if (capability === 'frame') { art.start(); bootLaunch(); }
    else if (capability === 'non-frame' || capability === 'not-advertised') { state.guard.artMode = 'not-supported'; bootLaunch(); }
    else { block('TV capability unknown'); capabilityRetry = setTimeout(discoverCapability, 5000); }
  });
}
module.exports.onStart = function () {
  if (started) { return; }
  started = true; bootUntil = Date.now() + BOOT_DELAY;
  bootFallback = setTimeout(bootLaunch, BOOT_FALLBACK);
  server = http.createServer(function (req, res) {
    var url = require('url').parse(req.url, true), query = url.query;
    if (url.pathname === '/watch') {
      invalidate('app launch requested');
      state.watched = query.id || null; state.seen = false; state.leaving = false;
      resetWatchedTiming(); state.watchAt = Date.now();
    } else if (url.pathname === '/apps') {
      invalidate('app inventory changed');
      state.apps = (query.ids || '').split(',').filter(Boolean);
      state.snapAt = 0; // re-read what is running before Home can be pressed
    } else if (url.pathname === '/leave') {
      invalidate('Samsung Home escape'); state.leaving = true; resetTracking();
    } else if (url.pathname === '/home') {
      invalidate('launcher returned'); state.leaving = false; resetTracking();
    }
    var response = Object.assign({}, state, { art: art.getState() });
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(response));
  });
  server.listen(47790, '127.0.0.1');
  interval = setInterval(tick, 300);
  discoverCapability();
};
module.exports.onRequest = function () {};
module.exports.onExit = function () {
  stopped = true; invalidate('service exit'); scanNumber += 1;
  clearInterval(interval); clearTimeout(capabilityRetry); clearTimeout(bootFallback);
  art.stop();
  if (server) { server.close(); server = null; }
};
