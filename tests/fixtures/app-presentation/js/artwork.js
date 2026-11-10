// Read app artwork from Samsung's local cache. No app images are bundled.
(function (A) {
  "use strict";

  var SAMSUNG_ICON_CACHE_PATH = /^\/opt\/share\/webappservice\/apps_icon\/(?:all|FirstScreen)\/(\d+)\//;

  function packageIcon(app) {
    var icon = app.icon;
    return typeof icon === "string" && !SAMSUNG_ICON_CACHE_PATH.test(icon) ? icon : "";
  }

  function sources(app) {
    if (!A.tizen) {
      return [];
    }
    var result = [];
    function add(src) {
      if (typeof src === "string" && src && result.indexOf(src) < 0) {
        result.push(src);
      }
    }
    var cached = (app.icon || "").match(SAMSUNG_ICON_CACHE_PATH);
    var store =
      app.storeId || (cached && cached[1]) || (/^\d+$/.test(app.id) && app.id) || A.catalog.artworkStoreId(app);
    if (/^\d+$/.test(store)) {
      add("/opt/share/webappservice/apps_icon/all/" + store + "/304x304.png");
      add("/opt/share/webappservice/apps_icon/FirstScreen/" + store + "/250x250.png");
    }
    // The installed app's own icon also covers apps outside Samsung's store cache.
    add(app.icon);
    return result;
  }

  A.artwork = { sources: sources, packageIcon: packageIcon };
})(window.AeroTizen);
