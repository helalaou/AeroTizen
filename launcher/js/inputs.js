// TV inputs, named by the user or the TV, with visibility settings for Live TV and HDMI ports.
// Selected inputs are shown full screen inside the launcher.
(function (A) {
  'use strict';

  var tz = A.tizen;
  var inputs = A.inputs = { sources: [], watching: false };

  inputs.portName = function (s) { return s.type === 'TV' ? 'Live TV' : s.type + ' ' + s.number; };

  inputs.label = function (s) { return A.settings.inputNames[inputs.portName(s)] || s.editName || inputs.portName(s); };

  // Source icon markup ported from the independently tested glass dock.
  // Each tile keeps its original A.tiles.card click and D-pad handlers.
  function sourceIcon(paths) {
    return '<span class="aero-source-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false">' +
      paths + '</svg></span>';
  }

  function iconFor(s, label) {
    var n = String(label || '').toLowerCase();
    if (s.type === 'TV') {
      return sourceIcon('<rect x="3.5" y="5.5" width="17" height="12.5" rx="2"/>' +
        '<path d="M8 21h8M12 18v3"/>');
    }
    if (/xbox|playstation|ps\\d|switch|nintendo|game|console/.test(n)) {
      return sourceIcon('<path d="M7.5 8h9a3.5 3.5 0 0 1 3.4 2.8l1 5a2 2 0 0 1-3.3 1.9L15 15H9l-2.6 2.7a2 2 0 0 1-3.3-1.9l1-5A3.5 3.5 0 0 1 7.5 8z"/>' +
        '<path d="M7.5 10.5v4m-2-2h4"/><circle cx="15.5" cy="11.2" r=".7" fill="currentColor" stroke="none"/><circle cx="17.5" cy="13.1" r=".7" fill="currentColor" stroke="none"/>');
    }
    if (/pc|computer|mac|laptop/.test(n)) {
      return sourceIcon('<rect x="3" y="4.5" width="18" height="13" rx="1.8"/>' +
        '<path d="M8 21h8m-4-3.5V21"/>');
    }
    if (/cable|box|roku|fire|apple|shield|chromecast|blu|dvd|satellite/.test(n)) {
      return sourceIcon('<rect x="3.5" y="7" width="17" height="10" rx="2.3"/>' +
        '<circle cx="17" cy="12" r=".75" fill="currentColor" stroke="none"/>');
    }
    return sourceIcon('<path d="M6 8.5h12v4.3l-2 2.7H8l-2-2.7z"/>' +
      '<path d="M9 11v1.5m3-1.5v1.5m3-1.5v1.5"/>');
  }

  inputs.render = function () {
    var row = A.$('inputs');
    row.textContent = '';
    inputs.sources.forEach(function (s) {
      if (!A.settings.showLiveTv && s.type === 'TV') { return; }
      if (A.settings.hideDisconnectedHdmi && s.type === 'HDMI' && s.connected === false) { return; }
      var label = inputs.label(s), port = inputs.portName(s);
      var tile = A.tiles.card(label, iconFor(s, label), function () { inputs.show(s); });
      tile.classList.add('aero-source-card');
      // Badges describe TV-reported state only, never infer a live signal
      // from a saved input name or a standby-device label.
      var recognised = A.inputs.hasRecognizedDevice && A.inputs.hasRecognizedDevice(s);
      var status = '', statusClass = '';
      if (s.type === 'TV') {
        status = 'LIVE'; statusClass = 'aero-source-live';
      } else if (s.connected === true) {
        status = 'CONNECTED'; statusClass = 'aero-source-connected';
      } else if (s.active === true) {
        status = 'ACTIVE'; statusClass = 'aero-source-active';
      } else if (recognised) {
        status = 'RECOGNISED'; statusClass = 'aero-source-recognised';
      }
      if (status) {
        tile.classList.add(statusClass);
        var indicator = A.el('span', 'aero-source-status', status);
        indicator.setAttribute('aria-label', 'Source status: ' + status);
        tile.appendChild(indicator);
      }
      var title = tile.querySelector('.name');
      if (title) {
        var subtitle = s.type === 'TV' ? 'TV tuner' :
          label !== port ? port : s.active ? 'Selected source' :
          recognised ? 'Recognised device' : s.connected ? 'HDMI input' : '';
        if (subtitle) { title.appendChild(A.el('div', 'sub', subtitle)); }
      }
      if (s.connected === false && s.active !== true && !recognised) {
        tile.classList.add('off');
      }
      row.appendChild(tile);
    });
    // Empty ports disappear in filtered mode without shrinking the cards
    // of recognised devices: the tested dock has 354px-wide slots.
    row.classList.toggle('aero-dock-compact',
      A.settings.hideDisconnectedHdmi === true &&
      row.children.length > 0 && row.children.length <= 4);
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
