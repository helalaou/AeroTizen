// Installed apps: discovery, launching, the app store, and the Fireplace tile.
(function (A) {
  'use strict';

  var cfg = A.config, tz = A.tizen;
  var apps = A.apps = { all: [], realIds: [] };

  function isRealApp(a) {
    return a.show !== false && (cfg.STORE_PACKAGE.test(a.packageId || '') || Object.prototype.hasOwnProperty.call(cfg.PRELOADED_APPS, a.id));
  }

  function hbbtvLink(appId) {
    try {
      if (!tz.application.getAppMetaData) { return ''; }
      var metadata = tz.application.getAppMetaData(appId);
      for (var i = 0; metadata && i < metadata.length; i++) {
        var item = metadata[i];
        if (item && item.key === cfg.HBBTV_LINK_METADATA && typeof item.value === 'string' && item.value.trim()) {
          return item.value;
        }
      }
    } catch (e) { /* older TVs may not expose metadata for another app */ }
    return '';
  }

  apps.load = function (done) {
    if (!tz || !tz.application) {  // desktop browser preview
      apps.all = ['YouTube', 'Netflix', 'Stremio', 'Prime Video', 'Spotify - Music and Podcasts', 'TizenBrew', 'Disney+', 'Plex']
        .map(function (name, i) { return { id: 'demo' + i, name: name, icon: '' }; });
      return done();
    }
    tz.application.getAppsInfo(function (list) {
      // HbbTV content runs in a shared host; include it in the watcher's inventory.
      apps.realIds = list.filter(function (a) { return (isRealApp(a) || a.id === cfg.HBBTV_APP_ID) && !/service|DclHome001/i.test(a.id); })
        .map(function (a) { return cfg.PRELOADED_APPS[a.id] || a.id; });
      apps.all = list.filter(function (a) { return isRealApp(a) && a.name && !cfg.HIDDEN_APPS.test(a.id) && !cfg.HIDDEN_APPS.test(a.name); })
        .map(function (a) { return { id: a.id, name: a.name, icon: a.iconPath || '' }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      done();
    }, function () { apps.all = []; done(); });
  };

  apps.byId = function (id) {
    for (var i = 0; i < apps.all.length; i++) { if (apps.all[i].id === id) { return apps.all[i]; } }
    return null;
  };

  apps.defaultHome = function () {
    var picked = [];
    cfg.DEFAULT_HOME_APPS.forEach(function (want) {
      apps.all.forEach(function (a) {
        if (picked.indexOf(a.id) < 0 && a.name.toLowerCase().indexOf(want) === 0) { picked.push(a.id); }
      });
    });
    return [cfg.FIREPLACE_ID].concat(picked);
  };

  apps.launch = function (app) {
    var label = A.tiles.shortName(app.name);
    if (!tz || !tz.application) { return A.toast('Would open ' + label); }
    var link = hbbtvLink(app.id);
    if (link) {
      try {
        var data = [
          new tz.ApplicationControlData('tizenid', [app.id]),
          new tz.ApplicationControlData('hbbtv', [link]),
          new tz.ApplicationControlData('deeplink', ['true'])
        ];
        var control = new tz.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
        A.homewatch.watch(cfg.HBBTV_APP_ID);
        tz.application.launchAppControl(control, cfg.HBBTV_APP_ID, null, function () { A.toast('Could not open ' + label); });
      } catch (e) { A.toast('Could not open ' + label); }
      return;
    }
    A.homewatch.watch(app.id);
    tz.application.launch(app.id, null, function () { A.toast('Could not open ' + label); });
  };

  apps.openStore = function () {
    if (!tz || !tz.application) { return A.toast('Would open the Samsung app store'); }
    var ids = cfg.STORE_APP_IDS.slice();
    (function next() {
      var id = ids.shift();
      if (!id) { return A.toast('Could not open the app store'); }
      A.homewatch.watch(id);
      tz.application.launch(id, null, next);
    })();
  };

  // Fireplace: a fireplace video in YouTube; the built-in animated fire as a fallback.
  apps.playFireplace = function () {
    var yt = null;
    apps.all.forEach(function (a) { if (!yt && /^youtube$/i.test(a.name)) { yt = a; } });
    if (!tz || !yt) { return window.Fireplace.open(); }
    A.homewatch.watch(yt.id);
    try {
      var data = [new tz.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: 'v=' + cfg.FIREPLACE_VIDEO })])];
      tz.application.launchAppControl(new tz.ApplicationControl('http://tizen.org/appcontrol/operation/view', null, null, null, data),
        yt.id, null, function () { window.Fireplace.open(); });
    } catch (e) {
      window.Fireplace.open();
    }
  };
})(window.AeroTizen);
