// TV inputs, named by the user or the TV, with visibility settings for Live TV and HDMI ports.
// Selected inputs are shown full screen inside the launcher.
(function (A) {
  'use strict';

  var tz = A.tizen, ICONS = A.tiles.ICONS;
  var inputs = A.inputs = { sources: [], watching: false };

  inputs.portName = function (s) { return s.type === 'TV' ? 'Live TV' : s.type + ' ' + s.number; };

  inputs.label = function (s) { return A.settings.inputNames[inputs.portName(s)] || s.editName || inputs.portName(s); };

  function iconFor(s, label) {
    if (s.type === 'TV') { return ICONS.tv; }
    var n = label.toLowerCase();
    if (/xbox|playstation|ps\d|switch|nintendo|game|console/.test(n)) { return ICONS.game; }
    if (/pc|computer|mac|laptop/.test(n)) { return ICONS.pc; }
    if (/cable|box|roku|fire|apple|shield|chromecast|blu|dvd|satellite/.test(n)) { return ICONS.box; }
    return ICONS.hdmi;
  }

  inputs.render = function () {
    var row = A.$('inputs');
    row.textContent = '';
    inputs.sources.forEach(function (s) {
      if (!A.settings.showLiveTv && s.type === 'TV') { return; }
      if (A.settings.hideDisconnectedHdmi && s.type === 'HDMI' && s.connected === false) { return; }
      var label = inputs.label(s), port = inputs.portName(s);
      var tile = A.tiles.card(label, iconFor(s, label), function () { inputs.show(s); });
      if (label !== port && s.type !== 'TV') { tile.querySelector('.name').appendChild(A.el('div', 'sub', port)); }
      if (!s.connected) { tile.classList.add('off'); }
      row.appendChild(tile);
    });
    A.homeScreen.buildRows();
  };

  // Connected ports first, then empty ones; Live TV last. Refreshes when something is plugged in.
  inputs.load = function () {
    if (!tz || !tz.systeminfo) {  // desktop browser preview
      inputs.sources = [
        { type: 'HDMI', number: 1, editName: 'Xbox', connected: true }, { type: 'HDMI', number: 2, connected: false },
        { type: 'HDMI', number: 3, editName: 'PC', connected: false }, { type: 'TV', number: 1, connected: true }
      ];
      return inputs.render();
    }
    try {
      tz.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        function tag(list, connected) {
          return (list || []).filter(function (s) { return s.type !== 'MEDIA'; }).map(function (s) {
            return { type: s.type, number: s.number, editName: s.editName, connected: connected, raw: s };
          });
        }
        inputs.sources = tag(info.connected, true).concat(tag(info.disconnected, false)).sort(function (a, b) {
          return (a.type === 'TV') - (b.type === 'TV') || (b.connected - a.connected) || a.number - b.number;
        });
        inputs.render();
      }, inputs.render);
    } catch (e) { inputs.render(); }
  };

  inputs.show = function (s) {
    if (!tz || !tz.tvwindow) { return A.toast('Would switch to ' + inputs.label(s)); }
    try {
      tz.tvwindow.setSource(s.raw || s, function () {
        tz.tvwindow.show(function () {
          inputs.watching = true;
          document.body.classList.add('tv');
          document.documentElement.style.background = 'transparent';
          window.Backgrounds.hide();
        }, function () { A.toast('Could not show ' + inputs.label(s)); }, ['0px', '0px', '1920px', '1080px'], 'MAIN');
      }, function () { A.toast('Could not switch input'); }, 'MAIN');
    } catch (e) { A.toast('Could not switch input'); }
  };

  inputs.leave = function () {
    inputs.watching = false;
    document.body.classList.remove('tv');
    A.applyBackground();
    try { tz.tvwindow.hide(function () {}, function () {}, 'MAIN'); } catch (e) { /* already hidden */ }
  };

  if (tz && tz.systeminfo) {
    try { tz.systeminfo.addPropertyValueChangeListener('VIDEOSOURCE', inputs.load); } catch (e) { /* not supported */ }
  }
})(window.AeroTizen);
