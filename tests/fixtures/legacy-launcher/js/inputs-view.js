// Legacy input tiles used only by comparison tests.
(function (A) {
  "use strict";
  var inputs = A.inputs,
    ICONS = A.tiles.ICONS;

  function iconFor(s, label) {
    if (s.type === "TV") {
      return ICONS.tv;
    }
    var n = label.toLowerCase();
    if (/xbox|playstation|ps\d|switch|nintendo|game|console/.test(n)) {
      return ICONS.game;
    }
    if (/pc|computer|mac|laptop/.test(n)) {
      return ICONS.pc;
    }
    if (/cable|box|roku|fire|apple|shield|chromecast|blu|dvd|satellite/.test(n)) {
      return ICONS.box;
    }
    return ICONS.hdmi;
  }

  inputs.render = function () {
    var row = A.$("inputs");
    row.textContent = "";
    inputs.sources.forEach(function (s) {
      // Keep TV-recognised HDMI devices visible while in standby; empty ports
      // still follow the existing Hide disconnected setting.
      if (!inputs.isVisible(s)) {
        return;
      }
      var label = inputs.label(s),
        port = inputs.portName(s);
      var tile = A.tiles.card(label, iconFor(s, label), function () {
        inputs.show(s);
      });
      if (label !== port && s.type !== "TV") {
        tile.querySelector(".name").appendChild(A.el("div", "sub", port));
      }
      // A sleeping, recognised device is reachable: do not label it as empty.
      if (s.connected === false && !s.active && !inputs.hasRecognizedDevice(s) && !inputs.alwaysVisible(s)) {
        tile.classList.add("off");
      }
      row.appendChild(tile);
    });
    A.homeScreen.buildRows();
  };

  inputs.subscribe(inputs.render);
})(window.AeroTizen);
