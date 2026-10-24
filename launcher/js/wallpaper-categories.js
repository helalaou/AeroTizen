// Presentation-only V992.56 wallpaper filters. Browsing never saves a setting,
// starts weather, changes the background, or reconstructs existing controls.
(function (A) {
  'use strict';
  var selected = null, tabs = null;
  var choices = [['photo', 'Weather photos'], ['solid', 'Solid colour'],
    ['gradient', 'Gradients'], ['animated', 'Animated backgrounds']];
  function text(value) { return A.i18n && A.i18n.t ? A.i18n.t(value) : value; }
  function heading(id, visible) {
    var box = A.$(id), previous = box && box.previousElementSibling;
    if (previous && previous.tagName === 'H3') { previous.hidden = !visible; }
  }
  function show() {
    if (!tabs) { return; }
    [].forEach.call(tabs.children, function (tab) {
      var on = tab.dataset.category === selected;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-pressed', String(on));
    });
    var photo = A.$('weather-photo-choice');
    if (photo) { photo.hidden = selected !== 'photo'; heading('weather-photo-choice', selected === 'photo'); }
    var anim = A.$('bg-anim'), still = A.$('bg-still');
    anim.hidden = selected !== 'animated'; heading('bg-anim', selected === 'animated');
    still.hidden = selected !== 'solid' && selected !== 'gradient';
    heading('bg-still', !still.hidden);
    [].forEach.call(still.children, function (swatch) {
      swatch.hidden = selected === 'solid' ? swatch.dataset.key !== 'bg:black' : swatch.dataset.key === 'bg:black';
    });
    // The renderer remains the owner of speed-row.hidden (whether animated).
    // Its parent/category visibility controls navigation without losing that state.
    var speed = A.$('speed-row');
    speed.style.display = selected === 'animated' ? '' : 'none';
  }
  function refresh() {
    if (!A.glassUI) { return; }
    var anim = A.$('bg-anim');
    if (!anim || !anim.parentNode || !A.glassUI.isActive()) { return; }
    if (!tabs) {
      tabs = A.el('div', 'wallpaper-categories units');
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', text('Background type'));
      choices.forEach(function (choice) {
        if (choice[0] === 'photo' && !A.$('weather-photo-choice')) { return; }
        var tab = A.el('div', 'pill unit', text(choice[1]));
        tab.dataset.key = 'wall-category:' + choice[0];
        tab.dataset.category = choice[0];
        tab.setAttribute('role', 'button');
        tab.onclick = function () { selected = choice[0]; show(); A.settingsUi.focus(); };
        tabs.appendChild(tab);
      });
      anim.parentNode.insertBefore(tabs, anim.parentNode.firstChild);
    }
    if (!selected) {
      selected = A.settings.weatherPhoto ? 'photo' : A.settings.background === 'black' ? 'solid' : 'gradient';
      window.Backgrounds.list.forEach(function (b) {
        if (!A.settings.weatherPhoto && b.id === A.settings.background && b.anim) { selected = 'animated'; }
      });
    }
    [].forEach.call(tabs.children, function (tab) {
      choices.forEach(function (choice) {
        if (choice[0] === tab.dataset.category) { tab.textContent = text(choice[1]); }
      });
    });
    show();
  }
  A.wallpapers = { refresh: refresh };
})(window.AeroTizen);
