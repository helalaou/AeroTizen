// Frozen SVG-string renderer for before/after wave comparisons only.
window.Backgrounds.registerWaveRenderer(function (layer, speed) {
  var WAVE_SECONDS = [28, 18];
  var paths = [
    "M0 60 Q 240 20 480 60 T 960 60 T 1440 60 T 1920 60 V 200 H 0 Z",
    "M0 80 Q 240 40 480 80 T 960 80 T 1440 80 T 1920 80 V 200 H 0 Z",
  ];
  [
    ["rgba(30,130,190,.28)", "bg-wave1"],
    ["rgba(20,90,150,.38)", "bg-wave2"],
  ].forEach(function (w, i) {
    var d = document.createElement("div");
    d.className = "bg-wave " + w[1];
    d.style.animationDuration = WAVE_SECONDS[i] / speed + "s";
    d.innerHTML =
      '<svg viewBox="0 0 1920 200" preserveAspectRatio="none"><path fill="' +
      w[0] +
      '" d="' +
      paths[i] +
      '"/>' +
      '<path fill="' +
      w[0] +
      '" transform="translate(1920 0)" d="' +
      paths[i] +
      '"/></svg>';
    layer.appendChild(d);
  });
  return function () {
    layer.textContent = "";
  };
});
