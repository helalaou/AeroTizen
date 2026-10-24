// Unified glass presentation based on the established AeroTizen settings
// category, smooth-focus and single-outline implementation.
// Existing controls and handlers are moved, never replaced or cloned.
(function (A) {
  'use strict';

  var editor = A.$('editor');
  if (!editor || !A.settingsUi) { return; }
  var state = {
    built: false, active: 'appearance', expanded: false,
    nav: [], panes: {}, menu: null, scroll: null,
    categoryGlider: null, contentGlider: null, focusSection: null
  };
  var groups = [
    { id: 'appearance', title: 'Home appearance', hint: 'Layout and indicators', icon: '\u25a6' },
    { id: 'apps', title: 'Applications', hint: 'Home favourites and Samsung Home', icon: '\u25a3' },
    { id: 'wallpaper', title: 'Backgrounds', hint: 'Colours and animation', icon: '\u25a7' },
    { id: 'status', title: 'Weather and clock', hint: 'Weather, time and date', icon: '\u2600' },
    { id: 'sources', title: 'Inputs', hint: 'Live TV and HDMI', icon: '\u25a1' }
  ];
  // Map by original heading text, not control IDs; the original controls
  // remain compatible with upstream changes in their own renderers.
  var headings = {
    'Animated backgrounds': 'wallpaper',
    'Still backgrounds': 'wallpaper',
    'Weather': 'status',
    'Temperature': 'status',
    'Date & time': 'status',
    'Clock layout': 'status',
    'Clock style': 'status',
    'Network indicator': 'appearance',
    'App cards': 'appearance',
    'Live TV': 'sources',
    'HDMI ports': 'sources',
    'Input names': 'sources',
    'Show in app menu': 'apps'
  };
  function node(tag, className, label) {
    var n = document.createElement(tag);
    if (className) { n.className = className; }
    if (label !== undefined) { n.textContent = label; }
    return n;
  }
  // Temporary fallback for new labels until the localization contribution
  // owns them; existing upstream translations always take precedence.
  var italianLabels = {
    'Home appearance': 'Aspetto Home',
    'Layout and indicators': 'Stile, disposizione e rete',
    'Applications': 'Applicazioni',
    'Home favourites and Samsung Home': 'App visibili e Home Samsung',
    'Backgrounds': 'Sfondi',
    'Colours and animation': 'Colori e animazioni',
    'Weather and clock': 'Meteo e orologio',
    'Weather, time and date': 'Meteo, ora e data',
    'Inputs': 'Sorgenti',
    'Live TV and HDMI': 'TV in diretta e HDMI',
    'Close settings': 'Chiudi impostazioni'
  };
  function translate(text) {
    var translated = A.i18n && A.i18n.t ? A.i18n.t(text) : text;
    if (translated !== text) { return translated; }
    if (A.i18n && A.i18n.code && A.i18n.code() === 'it') {
      return italianLabels[text] || text;
    }
    return text;
  }
  function findGroup(id) {
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === id) { return groups[i]; }
    }
    return groups[0];
  }
  function create() {
    if (state.built) { return; }
    var children = [].slice.call(editor.children);
    var oldHeading = children[0] && children[0].tagName === 'H2' ? children[0] : node('h2', '', 'Settings');
    var frame = node('div', 'aero-settings-frame');
    var sidebar = node('div', 'aero-settings-sidebar');
    var heading = node('div', 'aero-settings-head');
    heading.appendChild(node('div', 'aero-settings-kicker', 'AEROTIZEN'));
    heading.appendChild(oldHeading);
    sidebar.appendChild(heading);
    var nav = node('div', 'aero-settings-menu');
    var categoryGlider = node('div', 'aero-settings-glider');
    categoryGlider.setAttribute('aria-hidden', 'true');
    nav.appendChild(categoryGlider);
    var body = node('div', 'aero-settings-main');
    var contentHead = node('div', 'aero-settings-content-head');
    contentHead.appendChild(node('span', 'aero-settings-content-kicker', 'CUSTOMISATION'));
    var title = node('h2', 'aero-settings-active-title', '');
    contentHead.appendChild(title);
    var close = node('div', 'aero-settings-close', '\u00d7');
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', 'Close settings');
    close.onclick = function () { A.settingsUi.close(); };
    contentHead.appendChild(close);
    body.appendChild(contentHead);
    var scroll = node('div', 'aero-settings-scroll');
    var contentGlider = node('div', 'aero-content-glider');
    contentGlider.setAttribute('aria-hidden', 'true');
    scroll.appendChild(contentGlider);

    groups.forEach(function (group) {
      var button = node('div', 'aero-section-entry');
      button.dataset.key = 'section:' + group.id;
      button.dataset.sectionMenu = group.id;
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', translate(group.title));
      button.appendChild(node('span', 'aero-section-icon', group.icon));
      var label = node('span', 'aero-section-label');
      label.appendChild(node('strong', '', translate(group.title)));
      label.appendChild(node('small', '', translate(group.hint)));
      button.appendChild(label);
      button.appendChild(node('span', 'aero-section-chevron', '\u203a'));
      button.onclick = function () { activate(group.id); if (A.settingsUi.focus) { A.settingsUi.focus(); } };
      nav.appendChild(button);
      state.nav.push(button);
      var pane = node('div', 'aero-section-pane');
      pane.dataset.sectionPane = group.id;
      pane.hidden = true;
      state.panes[group.id] = pane;
      scroll.appendChild(pane);
    });
    sidebar.appendChild(nav);
    sidebar.appendChild(node('div', 'aero-settings-help', '\u2191\u2193 Section   \u2192 Open   \u2190 Back'));
    body.appendChild(scroll);
    frame.appendChild(sidebar);
    frame.appendChild(body);
    editor.appendChild(frame);

    // This grouping deliberately retains upstream controls, selected states,
    // settings storage and callbacks; only their parent containers change.
    var section = 'appearance';
    for (var i = 1; i < children.length; i++) {
      var child = children[i];
      if (child.tagName === 'H3') {
        var text = (child.getAttribute('data-i18n') || child.textContent || '').trim();
        section = headings[text] || 'appearance';
      } else if (child.id === 'escape') { section = 'apps'; }
      // Keep section headings and informational copy alongside their
      // original controls, including the weather search status.
      state.panes[section].appendChild(child);
    }
    editor.classList.add('aero-settings-ready');
    editor.addEventListener('click', function (event) {
      if (event.target === editor) { A.settingsUi.close(); }
    });
    state.menu = nav;
    state.scroll = scroll;
    state.categoryGlider = categoryGlider;
    state.contentGlider = contentGlider;
    state.title = title;
    state.built = true;
    activate('appearance');
  }
  function activate(id) {
    if (!state.built) { create(); }
    if (!state.panes[id]) { return; }
    var changed = state.active !== id;
    state.active = id;
    if (changed) {
      state.contentGlider.classList.remove('is-visible');
      state.focusSection = null;
    }
    groups.forEach(function (group, i) {
      state.panes[group.id].hidden = group.id !== id;
      state.nav[i].classList.toggle('aero-current-section', group.id === id);
    });
    state.title.textContent = translate(findGroup(id).title);
    state.scroll.scrollTop = 0;
  }
  // Read actual wrapping instead of guessing the number of columns; this
  // handles different label lengths and narrower controls on older TVs.
  function visibleRows() {
    var rows = [];
    var content = state.panes[state.active], line = [], lastTop = null;
    var controls = content.querySelectorAll('[data-key]');
    for (var i = 0; i < controls.length; i++) {
      var item = controls[i];
      if (item.hidden || item.offsetParent === null || item.getAttribute('aria-hidden') === 'true') { continue; }
      var top = item.getBoundingClientRect().top;
      if (line.length && (top > lastTop + 5 || line.length >= 5)) {
        rows.push(line); line = [];
      }
      line.push(item); lastTop = top;
    }
    if (line.length) { rows.push(line); }
    return rows;
  }
  function rows() { return state.nav.map(function (n) { return [n]; }).concat(visibleRows()); }
  function updateHighlight(focused) {
    if (!state.built) { return; }
    var inMenu = !!(focused && focused.dataset && focused.dataset.sectionMenu);
    var nav = inMenu ? focused : state.nav[activeIndex()];
    if (nav) {
      state.categoryGlider.style.height = nav.offsetHeight + 'px';
      state.categoryGlider.style.transform = 'translate3d(0,' + nav.offsetTop + 'px,0)';
      state.categoryGlider.classList.add('is-visible');
      state.categoryGlider.classList.toggle('is-content', !inMenu);
    }
    var plate = state.contentGlider;
    if (inMenu || !focused || !state.panes[state.active].contains(focused)) {
      plate.classList.remove('is-visible');
      return;
    }
    var r = focused.getBoundingClientRect();
    var s = state.scroll.getBoundingClientRect();
    if (!r.width || !r.height) { plate.classList.remove('is-visible'); return; }
    var left = r.left - s.left + state.scroll.scrollLeft;
    var top = r.top - s.top + state.scroll.scrollTop;
    if (state.focusSection !== state.active) {
      plate.classList.add('no-motion');
      state.focusSection = state.active;
    } else { plate.classList.remove('no-motion'); }
    plate.style.width = Math.round(r.width) + 'px';
    plate.style.height = Math.round(r.height) + 'px';
    var radius = '17px';
    try {
      if (window.getComputedStyle) {
        var style = window.getComputedStyle(focused);
        if (style && style.borderRadius) { radius = style.borderRadius; }
      }
    } catch (e) { /* Fall back to the shared button radius. */ }
    plate.style.borderRadius = radius;
    plate.style.transform = 'translate3d(' + Math.round(left) + 'px,' + Math.round(top) + 'px,0)';
    plate.classList.add('is-visible');
  }
  function scrollTo(item) {
    if (!item || !state.built) { return; }
    var inMenu = !!(item.dataset && item.dataset.sectionMenu);
    var scroller = inMenu ? state.menu : state.scroll;
    var child = item.getBoundingClientRect();
    var outer = scroller.getBoundingClientRect();
    var topInset = inMenu ? 22 : 76;
    var bottomInset = inMenu ? 22 : 54;
    var correction = 0;
    if (child.top < outer.top + topInset) {
      correction = child.top - outer.top - topInset;
    } else if (child.bottom > outer.bottom - bottomInset) {
      correction = child.bottom - outer.bottom + bottomInset;
    }
    if (correction) {
      var limit = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.style.scrollBehavior = 'auto';
      scroller.scrollTop = Math.max(0, Math.min(limit, scroller.scrollTop + correction));
    }
  }
  function activeIndex() {
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === state.active) { return i; }
    }
    return 0;
  }
  function refreshLabels() {
    if (!state.built) { return; }
    groups.forEach(function (group, i) {
      var label = state.nav[i].querySelector('.aero-section-label');
      if (label) {
        label.querySelector('strong').textContent = translate(group.title);
        label.querySelector('small').textContent = translate(group.hint);
      }
      state.nav[i].setAttribute('aria-label', translate(group.title));
    });
    state.title.textContent = translate(findGroup(state.active).title);
  }
  A.glassUI = {
    create: create, activate: activate, rows: rows, refreshLabels: refreshLabels,
    scrollTo: scrollTo, updateHighlight: updateHighlight,
    navCount: function () { return state.nav.length; },
    activeIndex: activeIndex,
    activeId: function () { return state.active; },
    isActive: function () { return state.built && A.settingsUi.isOpen(); }
  };
})(window.AeroTizen);
