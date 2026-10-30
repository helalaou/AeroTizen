// Fireplace: procedural fire (low-res heat map, upscaled) + synthesized crackle audio.
// No media files, so it stays tiny and runs smoothly on TV hardware.
window.Fireplace = (function () {
  'use strict';

  var W = 192, H = 108;               // simulation grid, upscaled by CSS to full screen
  var canvas, ctx, img, heat, palette, raf = null, running = false, last = 0;
  var audio = null, volume = 0.6;

  function buildPalette() {
    // black -> deep red -> orange -> yellow -> near white
    var stops = [[0, 0, 0, 0], [40, 40, 4, 2], [90, 140, 24, 4], [140, 220, 80, 10], [190, 250, 160, 40], [255, 255, 236, 170]];
    var p = new Uint8ClampedArray(256 * 3);
    for (var i = 0; i < 256; i++) {
      var s = 0; while (s < stops.length - 2 && i > stops[s + 1][0]) { s++; }
      var a = stops[s], b = stops[s + 1], t = (i - a[0]) / (b[0] - a[0]);
      for (var c = 0; c < 3; c++) { p[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * t; }
    }
    return p;
  }

  function setup() {
    canvas = document.getElementById('fire-canvas');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(W, H);
    heat = new Uint8Array(W * H);
    palette = buildPalette();
  }

  var MAX = 36, frame = 0;

  function step() {
    frame++;
    // Seed the bottom row from three slowly shifting "logs" so the fire has a hearth shape.
    for (var x = 0; x < W; x++) {
      var t = frame * 0.02, d = Math.abs(x - W / 2) / (W / 2);
      var logs = Math.max(0, 1 - d * 1.35) + 0.25 * Math.sin(x * 0.11 + t) + 0.2 * Math.sin(x * 0.05 - t * 1.7);
      var v = logs > 0.25 ? MAX : (logs > 0 ? (MAX * logs * 3) | 0 : 0);
      heat[(H - 1) * W + x] = Math.random() < 0.85 ? v : v >> 1;
    }
    // Doom-fire spread: each cell rises, drifts sideways and cools by a random amount.
    for (var x2 = 0; x2 < W; x2++) {
      for (var y = 1; y < H; y++) {
        var src = y * W + x2, h = heat[src];
        if (h === 0) { heat[src - W] = 0; continue; }
        var r = (Math.random() * 4) | 0;
        var dst = src - W - (r - 1);
        if (dst < 0) { continue; }
        var nv = h - (r & 1) - (Math.random() < 0.18 ? 1 : 0);
        heat[dst] = nv > 0 ? nv : 0;
      }
    }
    var px = img.data;
    for (var i = 0; i < W * H; i++) {
      var p = ((heat[i] * 255 / MAX) | 0) * 3;
      px[i * 4] = palette[p]; px[i * 4 + 1] = palette[p + 1]; px[i * 4 + 2] = palette[p + 2]; px[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function loop(t) {
    if (!running) { return; }
    if (t - last > 33) { step(); last = t; }   // ~30 fps is plenty for fire
    raf = requestAnimationFrame(loop);
  }

  // ---- audio ---------------------------------------------------------------
  function startAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return; }
    var ac = new AC(), master = ac.createGain();
    master.gain.value = volume; master.connect(ac.destination);

    // Soft roar: brown noise through a low-pass filter.
    var len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0), lastOut = 0;
    for (var i = 0; i < len; i++) { var white = Math.random() * 2 - 1; lastOut = (lastOut + 0.02 * white) / 1.02; data[i] = lastOut * 3.2; }
    var roar = ac.createBufferSource(); roar.buffer = buf; roar.loop = true;
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    var roarGain = ac.createGain(); roarGain.gain.value = 0.55;
    roar.connect(lp); lp.connect(roarGain); roarGain.connect(master); roar.start();

    // Crackles: short filtered noise bursts at random intervals.
    var burst = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate), bd = burst.getChannelData(0);
    for (var j = 0; j < bd.length; j++) { bd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / bd.length, 6); }
    function crackle() {
      if (!audio) { return; }
      var s = ac.createBufferSource(); s.buffer = burst;
      var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 4500; bp.Q.value = 1.5;
      var g = ac.createGain(); g.gain.value = 0.15 + Math.random() * (Math.random() < 0.12 ? 1.2 : 0.45);
      s.connect(bp); bp.connect(g); g.connect(master); s.start();
      audio.timer = setTimeout(crackle, 40 + Math.random() * (Math.random() < 0.3 ? 900 : 220));
    }
    audio = { ac: ac, master: master, timer: null };
    crackle();
  }

  function stopAudio() {
    if (!audio) { return; }
    clearTimeout(audio.timer);
    try { audio.ac.close(); } catch (e) {}
    audio = null;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (audio) { audio.master.gain.value = volume; }
    var bar = document.getElementById('fire-volume');
    bar.textContent = volume === 0 ? window.AeroTizen.i18n.t('Muted') : window.AeroTizen.i18n.t('Volume ') + Math.round(volume * 10);
    bar.classList.add('show'); clearTimeout(setVolume.t);
    setVolume.t = setTimeout(function () { bar.classList.remove('show'); }, 1500);
  }

  return {
    open: function () {
      if (!canvas) { setup(); }
      document.getElementById('fireplace').hidden = false;
      running = true; raf = requestAnimationFrame(loop); startAudio();
    },
    close: function () {
      running = false; if (raf) { cancelAnimationFrame(raf); }
      stopAudio(); document.getElementById('fireplace').hidden = true;
    },
    isOpen: function () { return running; },
    volumeUp: function () { setVolume(volume + 0.1); },
    volumeDown: function () { setVolume(volume - 0.1); }
  };
})();
