// Render app and input cards. App identities and branding live in app-catalog.js.
(function (A) {
  'use strict';

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

  function brandFor(app) {
    var known = A.catalog.brand(app);
    if (known) { return known; }
    var name = app.name, n = name.toLowerCase();
    // Preserve the original icon and generated background for unknown apps.
    var h = 0;
    for (var j = 0; j < n.length; j++) { h = (h * 31 + n.charCodeAt(j)) % 360; }
    return { background: 'linear-gradient(135deg,hsl(' + h + ',55%,42%),hsl(' + ((h + 40) % 360) + ',65%,14%))',
             logo: null, label: shortName(name), textColour: '#ffffff', useAppIcon: true };
  }

  function logoSvg(logo, fill) {
    var d = window.LOGOS && window.LOGOS[logo.slug];
    return d ? svg('<path fill="' + fill + '" d="' + d + '"/>', 'logo') : '';
  }

  function appTile(app, extraClass, onSelect) {
    var b = brandFor(app), tile = A.el('div');
    tile.className = 'tile app-tile' + (extraClass ? ' ' + extraClass : '');
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', shortName(app.name));
    tile.title = shortName(app.name);
    tile.style.background = b.background;
    var fallback = A.el('div', 'app-fallback'), mark = b.logo && logoSvg(b.logo, b.logoColour);
    if (!b.label) { fallback.classList.add('logo-only'); }
    if (b.largeLogo) { fallback.classList.add('logo-big'); }
    if (mark) {
      fallback.innerHTML = mark;
    } else if (b.useAppIcon && app.icon) {
      var img = new Image();
      img.className = 'logo'; img.alt = '';
      img.onerror = function () { fallback.removeChild(img); };
      img.src = app.icon;
      fallback.appendChild(img);
    }
    if (b.label || !mark) {
      var name = A.el('div', 'name', b.label || shortName(app.name));
      name.style.color = b.textColour;
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
        // Do not let the fallback colour show through antialiased image corners.
        tile.style.background = 'transparent';
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
