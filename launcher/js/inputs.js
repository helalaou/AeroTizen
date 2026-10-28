// TV inputs, named by the user or the TV, with visibility settings for Live TV and HDMI ports.
// Selected inputs are shown full screen inside the launcher.
(function (A) {
  'use strict';

  var tz = A.tizen, ICONS = A.tiles.ICONS;
  var inputs = A.inputs = { sources: [], watching: false };
  var listeners = [];

  inputs.subscribe = function (listener) {
    listeners.push(listener);
    return function () {
      var index = listeners.indexOf(listener);
      if (index >= 0) { listeners.splice(index, 1); }
    };
  };

  function publish() {
    listeners.slice().forEach(function (listener) { listener(); });
    inputs.render();
  }

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

  // A configured device can appear in VIDEOSOURCE.disconnected while asleep.
  // Use the TV-provided editName, never a custom AeroTizen input name, as evidence.
  inputs.hasRecognizedDevice = function (s) {
    if (!s || s.type !== 'HDMI' || typeof s.editName !== 'string') { return false; }
    var name = s.editName.replace(/\s+/g, ' ').trim();
    if (!name) { return false; }
    var ordinary = name.toLowerCase().replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim();
    // The exact placeholder filter used in the reference HDMI implementation.
    if (/^(?:hdmi(?: \d+)?|ingresso(?: hdmi)?(?: \d+)?|source(?: hdmi)?(?: \d+)?|input(?: hdmi)?(?: \d+)?|sorgente(?: hdmi)?(?: \d+)?|unknown(?: device)?|unrecognized(?: device)?|unrecognised(?: device)?|dispositivo sconosciuto|sconosciuto|non riconosciuto|nessun dispositivo|no device|not connected|non collegato|disconnected)$/i.test(ordinary)) { return false; }
    return true;
  };

  inputs.alwaysVisible = function (s) {
    return !!(s && s.type === 'HDMI' && (A.settings.hdmiKeepVisible || {})[String(s.number)] === true);
  };

  inputs.isVisible = function (s) {
    if (s.type === 'TV') { return A.settings.showLiveTv !== false; }
    if (s.type !== 'HDMI' || A.settings.hideDisconnectedHdmi !== true) { return true; }
    return s.connected === true || s.active === true ||
      inputs.hasRecognizedDevice(s) || inputs.alwaysVisible(s);
  };

  inputs.render = function () {
    var row = A.$('inputs');
    row.textContent = '';
    inputs.sources.forEach(function (s) {
      // Keep TV-recognised HDMI devices visible while in standby; empty ports
      // still follow the existing Hide disconnected setting.
      if (!inputs.isVisible(s)) { return; }
      var label = inputs.label(s), port = inputs.portName(s);
      var tile = A.tiles.card(label, iconFor(s, label), function () { inputs.show(s); });
      if (label !== port && s.type !== 'TV') { tile.querySelector('.name').appendChild(A.el('div', 'sub', port)); }
      // A sleeping, recognised device is reachable: do not label it as empty.
      if (s.connected === false && !s.active && !inputs.hasRecognizedDevice(s) && !inputs.alwaysVisible(s)) { tile.classList.add('off'); }
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
      return publish();
    }
    try {
      tz.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        // A selected HDMI may be reported disconnected while the TV is
        // switching sources. Reading the selected source does not imply a cable.
        var current = null;
        try { if (tz.tvwindow && tz.tvwindow.getSource) { current = tz.tvwindow.getSource('MAIN'); } }
        catch (e) { /* firmware may deny this while no video window is active */ }
        function tag(list, connected) {
          return (list || []).filter(function (s) { return s.type !== 'MEDIA'; }).map(function (s) {
            var active = !!(current && s.type === 'HDMI' && current.type === 'HDMI' &&
              Number(current.number) === Number(s.number));
            return { type: s.type, number: s.number, editName: s.editName,
              connected: connected || s.signal === true, active: active, raw: s };
          });
        }
        // Keep one tile per port if firmware reports it in both lists.
        // The connected record wins; preserve a TV-recognised label if needed.
        var discovered = tag(info.connected, true).concat(tag(info.disconnected, false));
        var unique = {};
        discovered.forEach(function (s) {
          var id = String(s.type) + ':' + String(s.number), prior = unique[id];
          if (!prior) { unique[id] = s; return; }
          var preferred = (!prior.connected && s.connected) ? s : prior;
          var alternate = preferred === s ? prior : s;
          if (!inputs.hasRecognizedDevice(preferred) && inputs.hasRecognizedDevice(alternate)) {
            preferred.editName = alternate.editName;
          }
          unique[id] = preferred;
        });
        inputs.sources = Object.keys(unique).map(function (id) { return unique[id]; }).sort(function (a, b) {
          return (a.type === 'TV') - (b.type === 'TV') ||
            (Number(b.connected) - Number(a.connected)) || a.number - b.number;
        });
        publish();
      }, inputs.render);
    } catch (e) { inputs.render(); }
  };

  inputs.show = function (s) {
    // Native Live TV owns channel selection and remote control, unlike the
    // upstream embedded TVWindow. If unsupported, preserve TVWindow fallback.
    if (s && s.type === 'TV' && A.homewatch &&
        typeof A.homewatch.openNativeLiveTV === 'function' &&
        A.homewatch.openNativeLiveTV(s.raw || s) !== false) { return; }
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
