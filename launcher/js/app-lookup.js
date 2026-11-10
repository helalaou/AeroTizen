// Shared lookups over app-catalog.js. Keep identity separate from display names.
(function (A) {
  "use strict";

  var catalog = A.catalog,
    byId = Object.create(null),
    preloaded = Object.create(null);
  catalog.apps.forEach(function (entry) {
    entry.variants.forEach(function (variant) {
      var match = { storeId: variant.storeId || null };
      if (variant.appId) {
        byId[variant.appId] = match;
      }
      if (variant.storeId) {
        byId[variant.storeId] = match;
      }
      if (variant.preloaded) {
        preloaded[variant.appId] = variant.storeId;
      }
    });
  });

  function find(app) {
    if (byId[app.id]) {
      return byId[app.id];
    }
    var name = (app.name || "").toLowerCase().replace(/ - .*/, "").trim();
    for (var i = 0; i < catalog.apps.length; i++) {
      var entry = catalog.apps[i],
        names = (entry.legacy && entry.legacy.artworkNames) || [];
      for (var j = 0; j < names.length; j++) {
        if (name === names[j]) {
          return {
            storeId: entry.variants.length ? entry.variants[0].storeId || null : null,
          };
        }
      }
    }
    return null;
  }

  catalog.artworkStoreId = function (app) {
    var match = find(app);
    return match ? match.storeId : null;
  };
  catalog.storeId = function (appId) {
    return byId[appId] ? byId[appId].storeId : null;
  };
  catalog.preloadedStoreId = function (appId) {
    return preloaded[appId] || null;
  };
})(window.AeroTizen);
