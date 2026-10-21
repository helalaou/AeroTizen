// Read app artwork from Samsung's local cache. No app images are bundled.
(function (A) {
  'use strict';

  var CATALOG = [
    { names: ['youtube'], id: '9Ur5IzDKqV.TizenYouTube', store: '111299001912' },
    { names: ['stremio'], id: 'IkWsFHtOY9.Stremio', store: '3202306031311' },
    { names: ['prime video', 'amazon prime video'], id: 'org.tizen.primevideo', store: '3201910019365' },
    { names: ['bbc iplayer'], id: 'DqEoaplKlw.bbchybrid', store: '3201601007670' },
    { names: ['bbc sounds'], id: 'GR7TWEBh5d.BBCSounds', store: '3202003020365' },
    { names: ['itvx', 'itv hub'], id: 'OEvCiupaFR.ITVHub', store: '121299000089' },
    { names: ['channel 4', 'all 4'], id: 'OCaxbgg9v6.chfourctv', store: '111299002148' },
    { names: ['disney+'], id: 'MCmYXNxgcu.DisneyPlus', store: '3201901017640' },
    { names: ['u', 'uktv play'], id: 'VQr0RGkyS9.UKTVPlay', store: '3201806016432' },
    { names: ['5', 'my5'], id: 'EkzyZtmneG.My5', store: '121299000612' },
    { names: ['spotify'], store: '3202007021175' },
    { names: ['samsung tv plus'], store: '3202405035480' }
  ];

  function sources(app) {
    if (!A.tizen) { return []; }
    var name = app.name.replace(/ - .*/, '').toLowerCase().trim();
    var result = [], entry = null;
    function add(src) { if (typeof src === 'string' && src && result.indexOf(src) < 0) { result.push(src); } }
    for (var i = 0; i < CATALOG.length; i++) {
      var item = CATALOG[i];
      if ((item.id && app.id === item.id) || app.id === item.store) { entry = item; break; }
    }
    if (!entry) {
      for (var j = 0; j < CATALOG.length; j++) {
        if (CATALOG[j].names.indexOf(name) >= 0) { entry = CATALOG[j]; break; }
      }
    }
    var cached = (app.icon || '').match(/^\/opt\/share\/webappservice\/apps_icon\/(?:all|FirstScreen)\/(\d+)\//);
    var store = app.storeId || (cached && cached[1]) || (/^\d+$/.test(app.id) && app.id) ||
      A.config.PRELOADED_APPS[app.id] || (entry && entry.store);
    if (/^\d+$/.test(store)) {
      add('/opt/share/webappservice/apps_icon/all/' + store + '/304x304.png');
      add('/opt/share/webappservice/apps_icon/FirstScreen/' + store + '/250x250.png');
    }
    if (cached) { add(app.icon); }
    return result;
  }

  A.artwork = { sources: sources };
})(window.AeroTizen);
