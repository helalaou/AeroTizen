// Read app artwork from Samsung's local cache. No app images are bundled.
(function (A) {
  'use strict';

  function sources(app) {
    if (!A.tizen) { return []; }
    var result = [];
    function add(src) { if (typeof src === 'string' && src && result.indexOf(src) < 0) { result.push(src); } }
    var cached = (app.icon || '').match(/^\/opt\/share\/webappservice\/apps_icon\/(?:all|FirstScreen)\/(\d+)\//);
    var store = app.storeId || (cached && cached[1]) || (/^\d+$/.test(app.id) && app.id) ||
      A.catalog.artworkStoreId(app);
    if (/^\d+$/.test(store)) {
      add('/opt/share/webappservice/apps_icon/all/' + store + '/304x304.png');
      add('/opt/share/webappservice/apps_icon/FirstScreen/' + store + '/250x250.png');
    }
    if (cached) { add(app.icon); }
    return result;
  }

  A.artwork = { sources: sources };
})(window.AeroTizen);
