// Square app artwork, with brand icons and labels as a final fallback.
(function (A) {
  'use strict';

  // match: lower-case name prefix; logo: Simple Icons slug from logos.js; fill: logo colour;
  // text: fallback label beside the logo; big: oversized fallback logo.
  var BRANDS = [
    { match: 'youtube', bg: '#ffffff', logo: 'youtube', fill: '#ff0000', text: 'YouTube', ink: '#0f0f0f' },
    { match: 'netflix', bg: 'linear-gradient(135deg,#e50914,#8a0610)', logo: 'netflix', fill: '#ffffff', text: null },
    { match: 'prime video', bg: 'linear-gradient(135deg,#1a98ff,#0f4c81)', logo: 'primevideo', fill: '#ffffff', text: null, big: true },
    { match: 'spotify', bg: 'linear-gradient(135deg,#1ed760,#0f8a3c)', logo: 'spotify', fill: '#000000', text: 'Spotify', ink: '#000000' },
    { match: 'stremio', bg: 'linear-gradient(135deg,#7b5bf5,#2b1d68)', logo: 'stremio', fill: '#ffffff', text: 'Stremio', ink: '#ffffff' },
    { match: 'max', bg: '#002be7', logo: 'max', fill: '#ffffff', text: null },
    { match: 'hulu', bg: '#1ce783', logo: 'hulu', fill: '#0b0c0f', text: null },
    { match: 'apple tv', bg: 'linear-gradient(135deg,#4a4a4f,#1c1c1e)', logo: 'appletv', fill: '#ffffff', text: null },
    { match: 'plex', bg: '#1f1f1f', logo: 'plex', fill: '#ebaf00', text: null },
    { match: 'twitch', bg: '#9146ff', logo: 'twitch', fill: '#ffffff', text: 'Twitch', ink: '#ffffff' },
    { match: 'crunchyroll', bg: '#f47521', logo: 'crunchyroll', fill: '#ffffff', text: 'Crunchyroll', ink: '#ffffff' },
    { match: 'paramount', bg: '#0064ff', logo: 'paramountplus', fill: '#ffffff', text: null },
    { match: 'tubi', bg: '#7408ff', logo: 'tubi', fill: '#ffffff', text: null },
    { match: 'jellyfin', bg: 'linear-gradient(135deg,#aa5cc3,#00a4dc)', logo: 'jellyfin', fill: '#ffffff', text: 'Jellyfin', ink: '#ffffff' },
    { match: 'disney', bg: 'linear-gradient(135deg,#1a3fa3,#06102e)', logo: null, text: 'Disney+', ink: '#ffffff' },
    { match: 'tizenbrew', bg: 'linear-gradient(135deg,#ff9e1b,#7a2c00)', logo: null, text: 'TizenBrew', ink: '#ffffff', useIcon: true }
  ];

  function svg(viewBoxContent, className) {
    return '<svg' + (className ? ' class="' + className + '"' : '') + ' viewBox="0 0 24 24">' + viewBoxContent + '</svg>';
  }
  var BADGE = '<rect width="24" height="24" rx="5" fill="#2c2c30"/>';
  var ICONS = {
    flame: svg('<path fill="#ffd27a" d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1 2.5 2.3 2.5 1.5 0 2.2-1.2 2-3 2.3 1.9 3.7 4.3 3.7 7A6.5 6.5 0 0 1 12 22.5 6.5 6.5 0 0 1 5.5 16c0-4.6 3.6-7.4 4.8-10.4C11 4.2 11.6 3 12 2z"/>', 'flame'),
    plus: svg('<circle cx="12" cy="12" r="10.5" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>', 'logo'),
    hdmi: svg(BADGE + '<path fill="#fff" d="M5 9h14v3l-2 3H7l-2-3zM8 11v1h1v-1zm3 0v1h2v-1zm4 0v1h1v-1z"/>'),
    tv: svg(BADGE + '<path fill="none" stroke="#fff" stroke-width="1.6" d="M5 8h14v9H5zM9 5l3 3 3-3"/>'),
    game: svg(BADGE + '<path fill="#fff" d="M7.5 8h9a3.5 3.5 0 0 1 3.4 4.3l-.8 3.2a2 2 0 0 1-3.4.9L14.3 15H9.7l-1.4 1.4a2 2 0 0 1-3.4-.9l-.8-3.2A3.5 3.5 0 0 1 7.5 8zM8 10v1H7v1h1v1h1v-1h1v-1H9v-1zm7.5.3a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zm-1.6 1.6a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z"/>'),
    pc: svg(BADGE + '<path fill="none" stroke="#fff" stroke-width="1.6" d="M5 6.5h14v9H5zM9 19h6M12 15.5V19"/>'),
    box: svg(BADGE + '<path fill="none" stroke="#fff" stroke-width="1.6" d="M4.5 10h15v5h-15z"/><circle cx="16.5" cy="12.5" r="1" fill="#fff"/>')
  };

  function shortName(name) { return name.replace(/ - .*/, '').replace(/NextGeneration$/, ''); }

  function brandFor(name) {
    var n = name.toLowerCase();
    for (var i = 0; i < BRANDS.length; i++) { if (n.indexOf(BRANDS[i].match) === 0) { return BRANDS[i]; } }
    // Preserve the original icon and generated background for unknown apps.
    var h = 0;
    for (var j = 0; j < n.length; j++) { h = (h * 31 + n.charCodeAt(j)) % 360; }
    return { bg: 'linear-gradient(135deg,hsl(' + h + ',55%,42%),hsl(' + ((h + 40) % 360) + ',65%,14%))',
             logo: null, text: shortName(name), ink: '#ffffff', useIcon: true };
  }

  function logoSvg(slug, fill) {
    var d = window.LOGOS && window.LOGOS[slug];
    return d ? svg('<path fill="' + fill + '" d="' + d + '"/>', 'logo') : '';
  }

  function appTile(app, extraClass, onSelect) {
    var b = brandFor(app.name), tile = A.el('div');
    tile.className = 'tile app-tile' + (extraClass ? ' ' + extraClass : '');
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', shortName(app.name));
    tile.title = shortName(app.name);
    tile.style.background = b.bg;
    var fallback = A.el('div', 'app-fallback'), mark = b.logo && logoSvg(b.logo, b.fill);
    if (!b.text) { fallback.classList.add('logo-only'); }
    if (b.big) { fallback.classList.add('logo-big'); }
    if (mark) {
      fallback.innerHTML = mark;
    } else if (b.useIcon && app.icon) {
      var img = new Image();
      img.className = 'logo'; img.alt = '';
      img.onerror = function () { fallback.removeChild(img); };
      img.src = app.icon;
      fallback.appendChild(img);
    }
    if (b.text || !mark) {
      var name = A.el('div', 'name', b.text || shortName(app.name));
      name.style.color = b.ink;
      fallback.appendChild(name);
    }
    tile.appendChild(fallback);
    tile.onclick = onSelect;

    var sources = A.artwork.sources(app), at = 0;
    function next() {
      if (at >= sources.length) { return; }
      var image = new Image(), src = sources[at++], timer;
      function clear() { clearTimeout(timer); image.onload = image.onerror = null; }
      function failed() { clear(); next(); }
      image.className = 'app-artwork'; image.alt = '';
      image.onload = function () {
        clear();
        fallback.hidden = true;
        tile.classList.add('has-artwork');
        tile.appendChild(image);
      };
      image.onerror = failed;
      // Keep the fallback visible if a local file lookup stalls on older firmware.
      timer = setTimeout(failed, 2000);
      image.src = src;
    }
    next();
    return tile;
  }

  // A compact card (icon + label), used for inputs.
  function card(label, iconSvg, onSelect) {
    var tile = A.el('div', 'tile');
    tile.innerHTML = iconSvg;
    tile.appendChild(A.el('div', 'name', label));
    tile.onclick = onSelect;
    return tile;
  }

  A.tiles = { ICONS: ICONS, app: appTile, card: card, shortName: shortName };
})(window.AeroTizen);
