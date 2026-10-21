// The home screen: settings gear, the app grid (3 per row), and inputs, navigated with the
// remote. Holding OK on an app lifts it so the arrows can move it.
(function (A) {
  'use strict';

  var cfg = A.config, COLS = cfg.GRID_COLUMNS;
  var rows = [], row = 1, col = [], scrollY = 0;
  var moving = null;
  var CHEVRONS = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7' };

  function gridTiles() { return [].slice.call(A.$('grid').children); }

  function render() {
    var grid = A.$('grid'), home = A.settings.home;
    grid.textContent = '';
    home = home.filter(function (id) { return id === cfg.FIREPLACE_ID || A.apps.byId(id); });
    A.settings.home = home;
    home.forEach(function (id) {
      var tile;
      if (id === cfg.FIREPLACE_ID) {
        tile = A.el('div', 'tile fire');
        tile.innerHTML = A.tiles.ICONS.flame;
        tile.appendChild(A.el('div', 'name', 'Fireplace'));
        tile.onclick = A.apps.playFireplace;
      } else {
        var app = A.apps.byId(id);
        tile = A.tiles.banner(app, '', function () { A.apps.launch(app); });
      }
      tile.dataset.id = id;
      grid.appendChild(tile);
    });
    buildRows();
  }

  function buildRows() {
    rows = [[A.$('gear')]].concat(A.chunk(gridTiles(), COLS), [[].slice.call(A.$('inputs').children)]);
    for (var r = 0; r < rows.length; r++) { if (col[r] === undefined) { col[r] = 0; } }
    focus();
  }

  function focus() {
    if (A.settingsUi.isOpen()) { return; }
    A.clearFocus();
    row = Math.max(0, Math.min(row, rows.length - 1));
    while (row > 0 && !rows[row].length) { row--; }
    col[row] = Math.max(0, Math.min(col[row] || 0, rows[row].length - 1));
    var el = rows[row][col[row]];
    el.classList.add('focused');
    // Keep the focused row on screen (only matters with more than 6 apps). Measured on screen,
    // since offsetTop is relative to the nearest positioned parent.
    var rect = el.getBoundingClientRect();
    if (row <= 1) { scrollY = 0; } else if (rect.bottom > 1040) { scrollY += rect.bottom - 1040; } else if (rect.top < 140) { scrollY -= 140 - rect.top; }
    A.$('rows').style.transform = 'translate3d(0,' + (-scrollY) + 'px,0)';
  }

  function moveFocus(dRow, dCol) {
    if (dCol) { col[row] += dCol; return focus(); }
    var c = col[row] || 0, r = row + dRow;
    while (r > 0 && r < rows.length && !rows[r].length) { r += dRow; }
    if (r < 0 || r >= rows.length) { return; }
    row = r; col[row] = c; focus();
  }

  function current() { return rows[row] && rows[row][col[row]]; }

  // ---- hold OK to move ---------------------------------------------------------
  function showArrows() {
    var old = document.querySelectorAll('.move-arrow');
    for (var i = 0; i < old.length; i++) { old[i].parentNode.removeChild(old[i]); }
    if (!moving) { return; }
    var tiles = gridTiles(), at = tiles.indexOf(moving), n = tiles.length;
    var can = { left: at > 0, right: at < n - 1, up: at - COLS >= 0, down: at + COLS < n };
    Object.keys(can).forEach(function (dir) {
      if (!can[dir]) { return; }
      var arrow = A.el('div', 'move-arrow ' + dir);
      arrow.innerHTML = '<svg viewBox="0 0 24 24"><path fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="' + CHEVRONS[dir] + '"/></svg>';
      moving.appendChild(arrow);
    });
  }

  function startMove() {
    var el = current();
    if (!el || el.parentNode !== A.$('grid')) { return false; }
    moving = el;
    moving.classList.add('moving');
    showArrows();
    A.toast('Use the arrows to move it, OK to drop');
    return true;
  }

  function stepMove(delta) {
    var tiles = gridTiles(), from = tiles.indexOf(moving);
    var to = Math.max(0, Math.min(tiles.length - 1, from + delta));
    if (to === from) { return; }
    var grid = A.$('grid');
    grid.removeChild(moving);
    grid.insertBefore(moving, gridTiles()[to] || null);
    row = 1 + Math.floor(to / COLS); col[row] = to % COLS;
    buildRows();
    moving.classList.add('moving');
    showArrows();
  }

  function endMove() {
    A.settings.home = gridTiles().map(function (t) { return t.dataset.id; });
    moving.classList.remove('moving');
    moving = null;
    showArrows();
    A.settings.save();
    A.hideToast();
  }

  // ---- keys --------------------------------------------------------------------
  var KEY = cfg.KEY, pressTimer = null, pressHandled = false;

  function keydown(k, e) {
    if (moving) {
      if (k === KEY.LEFT) { stepMove(-1); } else if (k === KEY.RIGHT) { stepMove(1); } else if (k === KEY.UP) { stepMove(-COLS); } else if (k === KEY.DOWN) { stepMove(COLS); } else if (k === KEY.ENTER || k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); pressHandled = true; endMove(); }
      return;
    }
    if (k === KEY.ENTER) {
      // Held keys auto-repeat; only the first keydown starts the long-press timer.
      if (pressTimer || pressHandled) { return; }
      pressTimer = setTimeout(function () { pressTimer = null; pressHandled = startMove(); }, cfg.LONG_PRESS_MS);
      return;
    }
    if (k === KEY.LEFT) { moveFocus(0, -1); } else if (k === KEY.RIGHT) { moveFocus(0, 1); } else if (k === KEY.UP) { moveFocus(-1); } else if (k === KEY.DOWN) { moveFocus(1); } else if (k === KEY.BACK) { e.preventDefault(); }
  }

  // A short press (released before the long-press timer) opens the focused item.
  function keyup(k) {
    if (k === KEY.ENTER && pressTimer) {
      clearTimeout(pressTimer); pressTimer = null;
      var el = current();
      if (el === A.$('gear')) { A.settingsUi.open(); } else if (el && el.onclick) { el.onclick(); }
    }
    pressHandled = false;
  }

  A.homeScreen = { render: render, buildRows: buildRows, focus: focus, keydown: keydown, keyup: keyup };
})(window.AeroTizen);
