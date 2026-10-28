(function (A) {
  'use strict';
  var rendered = null, cards = Object.create(null), offset = 0;
  function createCard(item) {
    var hasEpisode = item.season > 0 && item.episode > 0;
    var card = A.el('div', 'continue-card' + (hasEpisode ? ' episodic' : ''));
    card.dataset.key = item.key;
    card.setAttribute('role', 'button');
    var episode = hasEpisode ? ' · S' + item.season + ' E' + item.episode : '';
    card.setAttribute('aria-label', item.title + episode + ' · ' + item.sourceName);
    var frame = A.el('div', 'continue-image-wrap');
    card.appendChild(frame);
    if (item.image) {
      var image = A.el('img', 'continue-image');
      image.alt = ''; image.src = item.image;
      image.onerror = function () { image.hidden = true; };
      frame.appendChild(image);
    }
    var icon = A.tiles.app({ id: item.sourceId, name: item.sourceName, icon: item.sourceIcon }, 'continue-app-icon', function () {});
    icon.removeAttribute('role'); icon.setAttribute('aria-hidden', 'true'); icon.onclick = null;
    frame.appendChild(icon);
    // Reserve the bar height even without progress, so labels stay aligned.
    var progress = A.el('div', 'continue-progress');
    progress.setAttribute('aria-hidden', 'true');
    if (item.duration > 0 && item.playback > 0) {
      var fill = A.el('div', 'continue-progress-fill');
      fill.style.width = Math.min(100, item.playback / item.duration * 100) + '%';
      progress.appendChild(fill);
    } else { progress.classList.add('empty'); }
    card.appendChild(progress);
    var label = A.el('div', 'continue-label');
    var details = A.el('div', 'continue-details');
    details.appendChild(A.el('div', 'continue-title', item.title));
    if (episode) { details.appendChild(A.el('div', 'continue-episode', episode.slice(3))); }
    label.appendChild(details);
    card.appendChild(label);
    card.onclick = function () { A.continueWatching.open(item); };
    return card;
  }
  function clampOffset(list) {
    offset = Math.max(0, Math.min(offset, list.scrollWidth - list.clientWidth));
    list.style.transform = 'translate3d(' + (-offset) + 'px,0,0)';
  }
  A.continueRow = {
    render: function (home) {
      var section = A.$('continue-section'), list = A.$('continue-items'), cw = A.continueWatching;
      section.hidden = !home || A.settings.continueWatching !== true || !cw.items.length;
      if (section.hidden) { return []; }
      if (rendered !== cw.items) {
        rendered = cw.items;
        var selected = list.querySelector('.focused'), key = selected && selected.dataset.key;
        var next = Object.create(null);
        cw.items.forEach(function (item, index) {
          var old = cards[item.key], card = old && old.item === item ? old.node : createCard(item);
          next[item.key] = { item: item, node: card };
          if (key === item.key) { card.classList.add('focused'); }
          if (list.children[index] !== card) { list.insertBefore(card, list.children[index] || null); }
        });
        while (list.children.length > cw.items.length) { list.removeChild(list.lastChild); }
        cards = next;
        clampOffset(list);
      }
      return [].slice.call(list.children);
    },
    focus: function (card) {
      var list = A.$('continue-items');
      if (card.parentNode !== list) { return; }
      var width = list.clientWidth;
      if (card.offsetLeft < offset) { offset = card.offsetLeft; }
      else if (card.offsetLeft + card.offsetWidth > offset + width) { offset = card.offsetLeft + card.offsetWidth - width; }
      clampOffset(list);
    }
  };
})(window.AeroTizen);
