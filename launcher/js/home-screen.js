// Home and All apps share a grid and remote navigation. Only Home tiles can be moved.
(function (A) {
  'use strict';

  var cfg = A.config, COLS = cfg.GRID_COLUMNS;
  var rows = [], row = 1, col = [], scrollY = 0;
  var page = 'home';
  var moving = null;
  var CHEVRONS = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7' };

  function gridTiles() { return [].slice.call(A.$('grid').children); }

  function render() {
    var grid = A.$('grid'), home = A.settings.home;
    grid.textContent = '';
    if (page === 'home') {
      home = home.filter(function (id) { return id === cfg.FIREPLACE_ID || A.apps.byId(id); });
      A.settings.home = home;
    } else {
      home = A.apps.all.map(function (app) { return app.id; });
    }
    A.$('apps-empty').hidden = page === 'home' || home.length > 0;
    grid.setAttribute('aria-label', page === 'home' ? 'Home apps' : 'All apps');
    ['home', 'apps'].forEach(function (name) {
      var tab = A.$(name + '-tab'), selected = (name === 'home') === (page === 'home');
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
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
    rows = [[A.$('gear'), A.$('home-tab'), A.$('apps-tab')]].concat(A.chunk(gridTiles(), COLS));
    var inputTiles = [].slice.call(A.$('inputs').children);
    A.$('inputs-section').hidden = page !== 'home' || inputTiles.length === 0;
    if (!A.$('inputs-section').hidden) { rows.push(inputTiles); }
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
    var main = A.$('rows'), rect = el.getBoundingClientRect(), mainTop = main.getBoundingClientRect().top;
    // Use the unscrolled position so rapid key repeats cannot compound an active transition.
    var viewportTop = main.parentNode.getBoundingClientRect().top;
    var top = rect.top - mainTop + viewportTop, bottom = rect.bottom - mainTop + viewportTop;
    if (row <= 1) { scrollY = 0; } else if (bottom - scrollY > 1040) { scrollY = bottom - 1040; } else if (top - scrollY < 140) { scrollY = Math.max(0, top - 140); }
    A.$('rows').style.transform = 'translate3d(0,' + (-scrollY) + 'px,0)';
  }

  function moveFocus(dRow, dCol) {
    if (dCol) { col[row] += dCol; return focus(); }
    var c = row === 0 ? 0 : col[row] || 0, r = row + dRow;
    while (r > 0 && r < rows.length && !rows[r].length) { r += dRow; }
    if (r < 0 || r >= rows.length) { return; }
    // Returning to the header selects the current page, regardless of the app column.
    row = r; col[row] = row === 0 ? (page === 'home' ? 1 : 2) : c; focus();
  }

  function current() { return rows[row] && rows[row][col[row]]; }

  function showPage(next) {
    if (moving) { endMove(); }
    clearTimeout(pressTimer); pressTimer = null;
    page = next;
    row = 0; col = [page === 'home' ? 1 : 2]; scrollY = 0;
    A.$('rows').style.transform = 'translate3d(0,0,0)';
    render();
  }

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
    if (page !== 'home' || !el || el.parentNode !== A.$('grid')) { return false; }
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
      e.preventDefault();
      // Held keys auto-repeat; only the first keydown starts the long-press timer.
      if (pressTimer || pressHandled) { return; }
      pressTimer = setTimeout(function () { pressTimer = null; pressHandled = startMove(); }, cfg.LONG_PRESS_MS);
      return;
    }
    if (k === KEY.LEFT) { moveFocus(0, -1); } else if (k === KEY.RIGHT) { moveFocus(0, 1); } else if (k === KEY.UP) { moveFocus(-1); } else if (k === KEY.DOWN) { moveFocus(1); } else if (k === KEY.BACK || k === KEY.ESC) {
      e.preventDefault();
      if (page !== 'home') { showPage('home'); }
    }
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
  A.$('gear').onclick = function () {
    if (moving) { endMove(); }
    A.settingsUi.open();
  };
  A.$('home-tab').onclick = function () { showPage('home'); };
  A.$('apps-tab').onclick = function () { showPage('apps'); };
})(window.AeroTizen);
