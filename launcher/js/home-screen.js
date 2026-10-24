// Home and All apps share a grid and remote navigation. Only Home tiles can be moved.
(function (A) {
  'use strict';

  var cfg = A.config, COLS = 3;
  var rows = [], row = 1, col = [], scrollY = 0;
  var page = 'home';
  var tabCache = { home: null, apps: null };
  var moving = null, tileMenu = null;
  var CHEVRONS = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7' };

  function gridTiles() { return [].slice.call(A.$('grid').children); }

  function render(fromTabSwitch) {
    if (!fromTabSwitch) { tabCache.home = null; tabCache.apps = null; }
    if (tileMenu) { closeTileMenu(false); }
    var grid = A.$('grid'), home = A.settings.home, size = A.settings.cardSize === 'small' ? 'small' : 'big';
    COLS = cfg.CARD_COLUMNS[size];
    grid.className = 'app-grid cards-' + size;
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
    if (fromTabSwitch && tabCache[page]) {
      grid.appendChild(tabCache[page]);
      tabCache[page] = null;
      buildRows();
      return;
    }
    var batch = document.createDocumentFragment();
    home.forEach(function (id) {
      var tile;
      if (id === cfg.FIREPLACE_ID) {
        tile = A.el('div', 'tile fire');
        tile.setAttribute('role', 'button');
        tile.setAttribute('aria-label', 'Fireplace');
        tile.title = 'Fireplace';
        tile.innerHTML = A.tiles.ICONS.flame;
        tile.onclick = A.apps.playFireplace;
      } else {
        var app = A.apps.byId(id);
        tile = A.tiles.app(app, '', function () { A.apps.launch(app); });
      }
      tile.dataset.id = id;
      batch.appendChild(tile);
    });
    grid.appendChild(batch);
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
    if (tileMenu) { closeTileMenu(false); }
    if (moving) { endMove(); }
    clearTimeout(pressTimer); pressTimer = null;
    if (page === next) { return; }
    var grid = A.$('grid'), parked = document.createDocumentFragment();
    while (grid.firstChild) { parked.appendChild(grid.firstChild); }
    tabCache[page] = parked;
    page = next;
    row = 0; col = [page === 'home' ? 1 : 2]; scrollY = 0;
    A.$('rows').style.transform = 'translate3d(0,0,0)';
    render(true);
  }


  // Holding OK opens actions without modifying favourites until the user confirms.
  // The same menu works for both Home and All apps (issue #22).
  function isAppTile(el) {
    return !!(el && el.parentNode === A.$('grid') && el.dataset && el.dataset.id);
  }

  function menuChoices(id) {
    if (page === 'home') {
      return [
        { action: 'move', label: 'Move' },
        { action: 'remove', label: 'Remove from Home' }
      ];
    }
    var alreadyHome = A.settings.home.indexOf(id) >= 0;
    return [{
      action: alreadyHome ? 'remove' : 'add',
      label: alreadyHome ? 'Remove from Home' : 'Add to Home'
    }];
  }

  function actionIcon(action) {
    var path = {
      move: '<path d="M12 3v18M3 12h18M8 6.5 12 3l4 3M8 18l4 3 4-3M6 8l-3 4 3 4M18 8l3 4-3 4"/>',
      add: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
      remove: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + path[action] + '</svg>';
  }

  function updateTileMenu() {
    if (!tileMenu) { return; }
    var actions = tileMenu.element.querySelectorAll('.tile-actions-option');
    for (var i = 0; i < actions.length; i++) {
      var selected = i === tileMenu.selected;
      actions[i].classList.toggle('selected', selected);
      actions[i].setAttribute('aria-selected', String(selected));
    }
    tileMenu.glider.style.transform = 'translate3d(0,' + (tileMenu.selected * 64) + 'px,0)';
  }

  function removeMenuElements(menu, backdrop) {
    if (menu.parentNode) { menu.parentNode.removeChild(menu); }
    if (backdrop.parentNode) { backdrop.parentNode.removeChild(backdrop); }
  }

  function closeTileMenu(restoreFocus) {
    if (!tileMenu) { return; }
    var old = tileMenu;
    tileMenu = null;
    old.element.classList.remove('is-open');
    old.element.classList.add('is-closing');
    old.backdrop.classList.remove('is-open');
    old.backdrop.classList.add('is-closing');
    setTimeout(function () { removeMenuElements(old.element, old.backdrop); }, 150);
    if (restoreFocus) { focus(); }
  }

  function openTileMenu(el) {
    if (!isAppTile(el) || moving || tileMenu) { return false; }
    // Clean up an exiting menu if the user opens another immediately.
    var stale = document.querySelectorAll('.tile-actions-menu.is-closing, .tile-actions-backdrop.is-closing');
    for (var i = 0; i < stale.length; i++) {
      if (stale[i].parentNode) { stale[i].parentNode.removeChild(stale[i]); }
    }
    var id = el.dataset.id, choices = menuChoices(id);
    var backdrop = A.el('div', 'tile-actions-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.onclick = function () { closeTileMenu(true); };
    var menu = A.el('div', 'tile-actions-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', A.i18n ? A.i18n.t('App actions') : 'App actions');
    var glider = A.el('div', 'tile-actions-glider');
    glider.setAttribute('aria-hidden', 'true');
    menu.appendChild(glider);
    choices.forEach(function (choice, index) {
      var option = A.el('div', 'tile-actions-option');
      var icon = A.el('span', 'tile-actions-icon');
      icon.innerHTML = actionIcon(choice.action);
      option.appendChild(icon);
      option.appendChild(A.el('span', 'tile-actions-label', A.i18n ? A.i18n.t(choice.label) : choice.label));
      option.setAttribute('role', 'menuitem');
      option.onclick = function () { chooseTileMenuAction(index); };
      menu.appendChild(option);
    });
    document.body.appendChild(backdrop);
    document.body.appendChild(menu);
    var rect = el.getBoundingClientRect(), ww = window.innerWidth || 1920;
    var wh = window.innerHeight || 1080, width = Math.min(382, ww - 48);
    var height = 24 + 64 * choices.length;
    var left = rect.right + 20;
    if (left + width > ww - 24) { left = rect.left - width - 20; }
    menu.style.left = Math.max(24, Math.min(ww - width - 24, left)) + 'px';
    menu.style.top = Math.max(24, Math.min(wh - height - 24, rect.top + 10)) + 'px';
    tileMenu = { element: menu, backdrop: backdrop, glider: glider,
      id: id, page: page, choices: choices, selected: 0 };
    updateTileMenu();
    el.classList.add('focused');
    function show() {
      if (tileMenu && tileMenu.element === menu) {
        backdrop.classList.add('is-open');
        menu.classList.add('is-open');
      }
    }
    var reducedMotion = false;
    try { reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { reducedMotion = false; }
    if (reducedMotion) { show(); }
    else if (window.requestAnimationFrame) { window.requestAnimationFrame(show); }
    else { setTimeout(show, 16); }
    return true;
  }

  function chooseTileMenuAction(index) {
    if (!tileMenu || !tileMenu.choices[index]) { return; }
    var action = tileMenu.choices[index].action, id = tileMenu.id;
    var origin = tileMenu.page, tiles = gridTiles();
    var oldIndex = tiles.map(function (el) { return el.dataset.id; }).indexOf(id);
    closeTileMenu(false);
    if (action === 'move') { startMove(); return; }
    var home = A.settings.home.slice();
    if (action === 'add') {
      if (home.indexOf(id) < 0) { home.push(id); }
    } else if (action === 'remove') {
      home = home.filter(function (appId) { return appId !== id; });
    }
    A.settings.home = home;
    A.settings.save();
    render();
    if (origin === 'home' && action === 'remove') {
      var remaining = gridTiles().length;
      if (remaining) {
        var next = Math.min(Math.max(oldIndex, 0), remaining - 1);
        row = 1 + Math.floor(next / COLS);
        col[row] = next % COLS;
      } else {
        var inputTiles = [].slice.call(A.$('inputs').children);
        if (!A.$('inputs-section').hidden && inputTiles.length) {
          row = rows.length - 1;
          col[row] = 0;
        } else {
          row = 0; col[0] = 1;  // Home tab
        }
      }
    } else if (origin === 'apps') {
      var allIndex = gridTiles().map(function (el) { return el.dataset.id; }).indexOf(id);
      if (allIndex >= 0) {
        row = 1 + Math.floor(allIndex / COLS);
        col[row] = allIndex % COLS;
      }
    }
    focus();
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
  var KEY = cfg.KEY, pressTimer = null, enterDown = false;

  function keydown(k, e) {
    if (tileMenu) {
      if (k === KEY.BACK || k === KEY.ESC) {
        e.preventDefault();
        closeTileMenu(true);
        return;
      }
      if (k === KEY.UP || k === KEY.DOWN || k === KEY.LEFT || k === KEY.RIGHT) {
        e.preventDefault();
        var change = (k === KEY.UP || k === KEY.LEFT) ? -1 : 1;
        tileMenu.selected = Math.max(0, Math.min(tileMenu.choices.length - 1, tileMenu.selected + change));
        updateTileMenu();
        return;
      }
      if (k === KEY.ENTER) {
        e.preventDefault();
        // Ignore auto-repeat and the original hold that opened this menu.
        if (enterDown) { return; }
        enterDown = true;
        chooseTileMenuAction(tileMenu.selected);
      }
      return;
    }
    if (moving) {
      if (k === KEY.LEFT) { e.preventDefault(); stepMove(-1); }
      else if (k === KEY.RIGHT) { e.preventDefault(); stepMove(1); }
      else if (k === KEY.UP) { e.preventDefault(); stepMove(-COLS); }
      else if (k === KEY.DOWN) { e.preventDefault(); stepMove(COLS); }
      else if (k === KEY.ENTER || k === KEY.BACK || k === KEY.ESC) {
        e.preventDefault();
        if (k !== KEY.ENTER || !enterDown) {
          if (k === KEY.ENTER) { enterDown = true; }
          endMove();
        }
      }
      return;
    }
    if (k === KEY.ENTER) {
      e.preventDefault();
      if (enterDown) { return; }
      enterDown = true;
      var heldTile = current();
      pressTimer = setTimeout(function () {
        pressTimer = null;
        if (enterDown && isAppTile(heldTile)) { openTileMenu(heldTile); }
      }, cfg.LONG_PRESS_MS);
      return;
    }
    if (k === KEY.LEFT) { e.preventDefault(); moveFocus(0, -1); }
    else if (k === KEY.RIGHT) { e.preventDefault(); moveFocus(0, 1); }
    else if (k === KEY.UP) { e.preventDefault(); moveFocus(-1); }
    else if (k === KEY.DOWN) { e.preventDefault(); moveFocus(1); }
    else if (k === KEY.BACK || k === KEY.ESC) {
      e.preventDefault();
      if (page !== 'home') { showPage('home'); }
    }
  }

  // A short press launches; a completed long press has no release-side action.
  function keyup(k) {
    if (k !== KEY.ENTER) { return; }
    enterDown = false;
    if (!pressTimer) { return; }
    clearTimeout(pressTimer);
    pressTimer = null;
    if (tileMenu || moving) { return; }
    var el = current();
    if (el === A.$('gear')) { A.settingsUi.open(); }
    else if (el && el.onclick) { el.onclick(); }
  }

  A.homeScreen = { render: render, buildRows: buildRows, focus: focus, keydown: keydown, keyup: keyup };
  A.$('gear').onclick = function () {
    if (moving) { endMove(); }
    A.settingsUi.open();
  };
  A.$('home-tab').onclick = function () { showPage('home'); };
  A.$('apps-tab').onclick = function () { showPage('apps'); };
})(window.AeroTizen);
