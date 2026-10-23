// Shared lookups over app-catalog.js. Keep identity separate from display names.
(function (A) {
  'use strict';

  var catalog = A.catalog, byId = Object.create(null), preloaded = Object.create(null);
  catalog.apps.forEach(function (entry) {
    entry.variants.forEach(function (variant) {
      var match = { entry: entry, storeId: variant.storeId || null };
      if (variant.appId) { byId[variant.appId] = match; }
      if (variant.storeId) { byId[variant.storeId] = match; }
      if (variant.preloaded) { preloaded[variant.appId] = variant.storeId; }
    });
  });

  function find(app, purpose) {
    if (byId[app.id]) { return byId[app.id]; }
    var name = (app.name || '').toLowerCase();
    if (purpose === 'artwork') { name = name.replace(/ - .*/, '').trim(); }
    var field = purpose === 'artwork' ? 'artworkNames' : 'brandPrefixes';
    for (var i = 0; i < catalog.apps.length; i++) {
      var entry = catalog.apps[i], names = (entry.legacy && entry.legacy[field]) || [];
      for (var j = 0; j < names.length; j++) {
        if (purpose === 'artwork' ? name === names[j] : name.indexOf(names[j]) === 0) {
          return { entry: entry, storeId: entry.variants.length ? entry.variants[0].storeId || null : null };
        }
      }
    }
    return null;
  }

  catalog.artworkStoreId = function (app) {
    var match = find(app, 'artwork');
    return match ? match.storeId : null;
  };
  catalog.brand = function (app) {
    var match = find(app, 'brand');
    return match ? match.entry.fallback || null : null;
  };
  catalog.preloadedStoreId = function (appId) { return preloaded[appId] || null; };
})(window.AeroTizen);
