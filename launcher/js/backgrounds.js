// Backgrounds: a curated set, static and animated. Everything is CSS or a tiny canvas;
// animated ones move soft radial-gradient "blobs" with transforms only (no blur filters),
// which TV GPUs composite cheaply. All stay dark so tiles remain readable.
window.Backgrounds = (function () {
  'use strict';

  function blob(color) { return 'radial-gradient(closest-side, ' + color + ', rgba(0,0,0,0))'; }

  var LIST = [
    // animated
    { id: 'aurora', name: 'Aurora', anim: 'blobs', base: '#04060b',
      blobs: ['rgba(32,178,150,.55)', 'rgba(110,80,220,.50)', 'rgba(40,120,220,.45)', 'rgba(60,220,140,.30)'] },
    { id: 'lava', name: 'Lava', anim: 'blobs', base: '#0a0405',
      blobs: ['rgba(230,80,20,.50)', 'rgba(200,30,80,.45)', 'rgba(255,150,40,.35)', 'rgba(140,20,120,.40)'] },
    { id: 'nebula', name: 'Nebula', anim: 'blobs', base: '#05040c', stars: true,
      blobs: ['rgba(140,60,220,.45)', 'rgba(220,70,160,.35)', 'rgba(50,90,220,.40)', 'rgba(80,40,160,.40)'] },
    { id: 'neon', name: 'Neon', anim: 'blobs', base: '#04040a',
      blobs: ['rgba(0,220,255,.40)', 'rgba(255,0,170,.38)', 'rgba(120,60,255,.40)', 'rgba(0,140,255,.30)'] },
    { id: 'calm', name: 'Calm', anim: 'blobs', base: '#07090d', slow: true,
      blobs: ['rgba(90,120,170,.35)', 'rgba(120,110,150,.30)', 'rgba(70,110,130,.30)', 'rgba(100,100,120,.25)'] },
    { id: 'sakura', name: 'Sakura', anim: 'blobs', base: '#0b0609',
      blobs: ['rgba(240,120,170,.38)', 'rgba(255,180,200,.25)', 'rgba(180,80,150,.35)', 'rgba(255,140,120,.22)'] },
    { id: 'deepsea', name: 'Deep Sea', anim: 'blobs', base: '#020810', slow: true,
      blobs: ['rgba(0,110,160,.45)', 'rgba(0,160,170,.30)', 'rgba(20,60,140,.45)', 'rgba(0,90,120,.35)'] },
    { id: 'golden', name: 'Golden Hour', anim: 'blobs', base: '#0b0704',
      blobs: ['rgba(255,170,60,.40)', 'rgba(230,100,80,.32)', 'rgba(255,210,120,.22)', 'rgba(170,70,100,.30)'] },
    { id: 'synthwave', name: 'Synthwave', anim: 'blobs', base: 'linear-gradient(180deg,#0a0418 0%,#170626 60%,#2a0830 100%)',
      blobs: ['rgba(255,40,160,.38)', 'rgba(90,40,255,.40)', 'rgba(255,120,40,.25)', 'rgba(0,200,255,.22)'] },
    { id: 'arctic', name: 'Arctic', anim: 'blobs', base: '#050a10', slow: true,
      blobs: ['rgba(140,200,255,.30)', 'rgba(200,230,255,.18)', 'rgba(90,150,220,.32)', 'rgba(160,220,240,.20)'] },
    { id: 'mint', name: 'Mint', anim: 'blobs', base: '#040a08',
      blobs: ['rgba(60,220,170,.32)', 'rgba(40,160,200,.28)', 'rgba(120,230,150,.22)', 'rgba(30,120,110,.35)'] },
    { id: 'starfield', name: 'Starfield', anim: 'stars', base: '#02030a' },
    { id: 'snow', name: 'Snowfall', anim: 'particles', kind: 'snow', base: 'linear-gradient(180deg,#0a1220 0%,#121c2c 100%)' },
    { id: 'fireflies', name: 'Fireflies', anim: 'particles', kind: 'fireflies', base: 'radial-gradient(1400px 900px at 50% 120%, #0d2216 0%, rgba(13,34,22,0) 60%), #030806' },
    { id: 'rain', name: 'Rain', anim: 'particles', kind: 'rain', base: 'linear-gradient(180deg,#070b12 0%,#0e1520 100%)' },
    { id: 'waves', name: 'Ocean Waves', anim: 'waves', base: 'linear-gradient(180deg,#03101c 0%,#05243a 100%)' },
    // static
    { id: 'black', name: 'Black', base: '#000' },
    { id: 'midnight', name: 'Midnight', base: 'radial-gradient(1500px 900px at 15% -10%, #1d2a52 0%, rgba(29,42,82,0) 60%), #04060c' },
    { id: 'graphite', name: 'Graphite', base: 'linear-gradient(180deg, #202126 0%, #0c0c0e 100%)' },
    { id: 'dusk', name: 'Dusk', base: 'linear-gradient(160deg, #2a1838 0%, #12101c 45%, #07070b 100%)' },
    { id: 'forest', name: 'Forest', base: 'radial-gradient(1400px 900px at 10% 110%, #0f3324 0%, rgba(15,51,36,0) 60%), #040907' },
    { id: 'ember', name: 'Ember', base: 'radial-gradient(1400px 800px at 85% 115%, #4a1a08 0%, rgba(74,26,8,0) 60%), #0a0605' },
    { id: 'ocean', name: 'Ocean', base: 'linear-gradient(170deg, #062a3a 0%, #04131d 55%, #02080d 100%)' },
    { id: 'sunset', name: 'Sunset', base: 'linear-gradient(170deg, #3b1440 0%, #2a0f22 40%, #3d1a0c 80%, #120806 100%)' },
    { id: 'navy', name: 'Navy', base: 'linear-gradient(170deg, #0d1b3a 0%, #060c1c 60%, #03060e 100%)' },
    { id: 'plum', name: 'Plum', base: 'radial-gradient(1500px 900px at 20% -10%, #3a1846 0%, rgba(58,24,70,0) 60%), #0a050d' },
    { id: 'mocha', name: 'Mocha', base: 'linear-gradient(165deg, #2e2018 0%, #17100c 55%, #0a0706 100%)' },
    { id: 'slate', name: 'Slate', base: 'linear-gradient(165deg, #2a3240 0%, #151a22 55%, #0a0d11 100%)' },
    { id: 'tealnight', name: 'Teal Night', base: 'radial-gradient(1400px 900px at 85% 110%, #0b3a3a 0%, rgba(11,58,58,0) 60%), #030a0b' },
    { id: 'wine', name: 'Wine', base: 'linear-gradient(165deg, #3a0f1c 0%, #1c070d 55%, #0b0306 100%)' },
    { id: 'rose', name: 'Rose', base: 'radial-gradient(1400px 900px at 80% -10%, #4a1430 0%, rgba(74,20,48,0) 60%), #0b0508' }
  ];

  var layer = null, canvasTimer = null, speed = 1, current = null, suspended = false;
  var BLOB_SECONDS = [11, 14, 16, 12], SLOW_SECONDS = 22, WAVE_SECONDS = [28, 18];

  // Small static rendering used for the Settings swatches.
  function preview(b) {
    if (b.anim === 'blobs') {
      return blob(b.blobs[0]) + ' 10% 20%/70% 90% no-repeat,' + blob(b.blobs[1]) + ' 90% 80%/70% 90% no-repeat,' +
             blob(b.blobs[2]) + ' 60% 10%/60% 80% no-repeat,' + b.base;
    }
    if (b.anim === 'stars') {
      return 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #fff, transparent),' +
             'radial-gradient(1.5px 1.5px at 40% 80%, #cfe0ff, transparent), radial-gradient(1px 1px at 85% 20%, #fff, transparent),' +
             'radial-gradient(1px 1px at 55% 40%, #fff, transparent), ' + b.base;
    }
    if (b.anim === 'particles') {
      var dot = b.kind === 'fireflies' ? '#d9ff7a' : b.kind === 'rain' ? 'rgba(170,200,255,.8)' : '#fff';
      return 'radial-gradient(2px 2px at 25% 30%, ' + dot + ', transparent), radial-gradient(2px 2px at 65% 55%, ' + dot + ', transparent),' +
             'radial-gradient(2px 2px at 45% 75%, ' + dot + ', transparent), radial-gradient(2px 2px at 85% 25%, ' + dot + ', transparent), ' + b.base;
    }
    if (b.anim === 'waves') { return 'linear-gradient(180deg, transparent 60%, rgba(40,140,200,.35) 60%, rgba(10,60,100,.6) 100%),' + b.base; }
    return b.base;
  }

  function clear() {
    if (canvasTimer) { if (canvasTimer.stop) { canvasTimer.stop(); } else { clearInterval(canvasTimer); } canvasTimer = null; }
    if (layer) { layer.textContent = ''; }
  }

  function addBlobs(b) {
    var spots = [[-10, -20, 1100], [55, 35, 1200], [20, 55, 1000], [70, -15, 900]];
    b.blobs.forEach(function (c, i) {
      var d = document.createElement('div');
      d.className = 'bg-blob bg-drift' + (i % 4);
      d.style.animationDuration = ((b.slow ? SLOW_SECONDS : BLOB_SECONDS[i % 4]) / speed) + 's';
      d.style.left = spots[i][0] + '%'; d.style.top = spots[i][1] + '%';
      d.style.width = d.style.height = spots[i][2] + 'px';
      d.style.background = blob(c);
      layer.appendChild(d);
    });
  }

  // ---- particle scenes, drawn at the TV's native 1920x1080 (no upscaling) ----------
  var W = 1920, H = 1080;

  // Pre-rendered soft sprites: one radial gradient drawn once, stamped many times. Crisper
  // and much cheaper than drawing glows per particle per frame.
  function sprite(size, stops) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d'), r = size / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(function (st) { grad.addColorStop(st[0], st[1]); });
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    return c;
  }

  // ~30 fps animation loop; `step(dt)` gets elapsed time in 1/30 s units, scaled by speed.
  function loop(step) {
    var last = 0, raf = window.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 33); };
    var alive = true;
    function frame(now) {
      if (!alive) { return; }
      if (!document.hidden && now - last >= 32) { step(Math.min(3, (now - (last || now - 33)) / 33.3) * speed); last = now; }
      raf(frame);
    }
    raf(frame);
    canvasTimer = { stop: function () { alive = false; } };
  }

  function canvas() {
    var c = document.createElement('canvas'); c.width = W; c.height = H; c.className = 'bg-canvas';
    layer.appendChild(c);
    return c.getContext('2d');
  }

  function addStars(dense) {
    var ctx = canvas(), stars = [], n = dense ? 420 : 180;
    var glow = sprite(32, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(235,242,255,.9)'], [0.35, 'rgba(170,200,255,.25)'], [1, 'rgba(170,200,255,0)']]);
    for (var i = 0; i < n; i++) {
      var depth = Math.random();
      stars.push({ x: Math.random() * W, y: Math.random() * H, size: 6 + depth * depth * 22,
                   v: 0.15 + depth * 1.6, p: Math.random() * 6.28, tw: 0.6 + Math.random() * 1.6 });
    }
    var t = 0;
    loop(function (dt) {
      t += 0.03 * dt; ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.x -= s.v * dt; if (s.x < -20) { s.x = W + 20; s.y = Math.random() * H; }
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.tw + s.p));
        ctx.drawImage(glow, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
      ctx.globalAlpha = 1;
    });
  }

  // Snow drifts with depth (near flakes bigger and faster), rain falls in fine streaks,
  // fireflies wander and pulse with a soft halo.
  function addParticles(kind) {
    var ctx = canvas(), ps = [], n = kind === 'rain' ? 260 : kind === 'snow' ? 260 : 70;
    var flake = sprite(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.85)'], [0.6, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']]);
    var fly = sprite(96, [[0, 'rgba(255,255,220,1)'], [0.08, 'rgba(235,255,140,.95)'], [0.3, 'rgba(200,255,80,.35)'], [1, 'rgba(180,255,60,0)']]);
    function spawn(p, fromTop) {
      p.d = Math.random();
      p.x = Math.random() * W; p.y = fromTop ? -40 : Math.random() * H;
      if (kind === 'snow') { p.size = 6 + p.d * p.d * 28; p.vy = 0.8 + p.d * 2.6; p.vx = (Math.random() - 0.5) * 0.6; }
      else if (kind === 'rain') { p.len = 18 + p.d * 38; p.vy = 18 + p.d * 16; p.vx = -2.5 - p.d * 2; p.w = 0.8 + p.d * 1.4; }
      else { p.size = 40 + p.d * 50; p.vx = (Math.random() - 0.5) * 0.8; p.vy = (Math.random() - 0.5) * 0.8; }
      p.ph = Math.random() * 6.28; return p;
    }
    for (var i = 0; i < n; i++) { ps.push(spawn({}, false)); }
    var t = 0;
    loop(function (dt) {
      t += 0.03 * dt; ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (kind === 'fireflies') {
          p.vx += (Math.random() - 0.5) * 0.15; p.vy += (Math.random() - 0.5) * 0.15; p.vx *= 0.97; p.vy *= 0.97;
        }
        p.x += (p.vx + (kind === 'snow' ? Math.sin(t * 1.5 + p.ph) * 0.6 : 0)) * dt; p.y += p.vy * dt;
        if (p.y > H + 60 || p.x < -80 || p.x > W + 80 || (kind === 'fireflies' && p.y < -80)) { spawn(p, kind !== 'fireflies'); }
        if (kind === 'rain') {
          ctx.strokeStyle = 'rgba(190,215,255,' + (0.18 + p.d * 0.4).toFixed(2) + ')'; ctx.lineWidth = p.w; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * p.len / p.vy, p.y - p.len); ctx.stroke();
        } else if (kind === 'snow') {
          ctx.globalAlpha = 0.45 + p.d * 0.55;
          ctx.drawImage(flake, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          ctx.globalAlpha = 0.15 + 0.85 * Math.pow(Math.abs(Math.sin(t * 0.9 + p.ph)), 2);
          ctx.drawImage(fly, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  function addWaves() {
    var paths = ['M0 60 Q 240 20 480 60 T 960 60 T 1440 60 T 1920 60 V 200 H 0 Z',
                 'M0 80 Q 240 40 480 80 T 960 80 T 1440 80 T 1920 80 V 200 H 0 Z'];
    [['rgba(30,130,190,.28)', 'bg-wave1'], ['rgba(20,90,150,.38)', 'bg-wave2']].forEach(function (w, i) {
      var d = document.createElement('div'); d.className = 'bg-wave ' + w[1];
      d.style.animationDuration = (WAVE_SECONDS[i] / speed) + 's';
      d.innerHTML = '<svg viewBox="0 0 1920 200" preserveAspectRatio="none"><path fill="' + w[0] + '" d="' + paths[i] + '"/>' +
                    '<path fill="' + w[0] + '" transform="translate(1920 0)" d="' + paths[i] + '"/></svg>';
      layer.appendChild(d);
    });
  }

  function apply(id) {
    suspended = false;
    var b = LIST.filter(function (x) { return x.id === id; })[0] || LIST[0];
    current = b.id;
    layer = layer || document.getElementById('bg');
    clear();
    // Only the root gets a background: a body background would paint over the animated layer.
    document.documentElement.style.background = b.base; document.body.style.background = 'transparent';
    if (b.anim === 'blobs') { addBlobs(b); if (b.stars) { addStars(false); } }
    else if (b.anim === 'stars') { addStars(true); }
    else if (b.anim === 'waves') { addWaves(); }
    else if (b.anim === 'particles') { addParticles(b.kind); }
    layer.hidden = false;
  }

  function hide() { if (layer) { layer.hidden = true; } }

  // Unlike hide(), suspend also stops any canvas animation. A static
  // photographic background should not burn GPU cycles behind the photo.
  function suspend() {
    suspended = true;
    clear();
    if (layer) { layer.hidden = true; }
  }

  // One multiplier for every animated background (0.5 = half speed, 2 = double).
  function setSpeed(m) { speed = m || 1; if (current && !suspended) { apply(current); } }

  return { list: LIST, preview: preview, apply: apply, hide: hide, suspend: suspend, setSpeed: setSpeed };
})();
