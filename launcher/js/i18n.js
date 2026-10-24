// The launcher follows the TV's language; English is the fallback for unsupported locales.
// App titles, user-defined HDMI names and location names must never be translated.
(function (A) {
  'use strict';

  var italian = {
    "Weather photos": "Foto meteo",
    "Solid colour": "Tinta unita",
    "Gradients": "Gradienti",
    "Background type": "Tipo di sfondo",
    "Wi-Fi (signal unavailable)": "Wi-Fi (intensità non disponibile)",
    "Network status unavailable": "Stato rete non disponibile",

    'All apps': 'Tutte le app',
    'Home apps': 'App Home',
    'No apps found.': 'Nessuna app trovata.',
    'Inputs': 'Sorgenti',
    'Settings': 'Impostazioni',
    'Animated backgrounds': 'Sfondi animati',
    'Still backgrounds': 'Sfondi statici',
    'Weather': 'Meteo',
    'Temperature': 'Temperatura',
    'Date & time': 'Data e ora',
    'Network indicator': 'Indicatore di rete',
    'App cards': 'Tessere applicazioni',
    'HDMI ports': 'Porte HDMI',
    'HDMI always visible': 'HDMI sempre visibili',
    'Always visible': 'Sempre visibile',
    'Optionally keep an unidentified HDMI port visible while disconnected.': 'Mantieni visibile una porta HDMI non identificata anche quando risulta scollegata.',
    'Input names': 'Nomi delle sorgenti',
    'Show in app menu': 'Mostra nel menu app',
    'Use Samsung Home instead': 'Usa la Home Samsung',
    'Show the Live TV tile in Inputs.': 'Mostra la tessera TV in diretta nelle Sorgenti.',
    'Choose whether to show HDMI ports that the TV reports as disconnected.': 'Scegli se mostrare le porte HDMI segnalate come scollegate.',
    'Press OK to show or hide a tile on the home screen. On the home screen, hold OK on a tile to move it.': 'Premi OK per mostrare o nascondere una tessera nella Home. Nella Home, tieni premuto OK su una tessera per spostarla.',
    'Live TV': 'TV in diretta',
    'Show weather': 'Mostra meteo',
    'Hide weather': 'Nascondi meteo',
    'Show location': 'Mostra località',
    'Hide location': 'Nascondi località',
    'Show all': 'Mostra tutte',
    'Hide disconnected': 'Nascondi scollegate',
    'Show': 'Mostra',
    'Hide': 'Nascondi',
    'Automatic': 'Automatica',
    'Search': 'Cerca',
    'Town, city or postcode': 'Città, paese o CAP',
    'Weather location': 'Località meteo',
    'Location: ': 'Località: ',
    'Automatic location uses your internet address and can be inaccurate. Search for your town, city or postcode to set it.': 'La localizzazione automatica usa il tuo indirizzo internet e può essere imprecisa. Cerca una città, un paese o un CAP.',
    'Enter at least two characters, then select Search.': 'Inserisci almeno due caratteri, poi seleziona Cerca.',
    'Searching…': 'Ricerca in corso…',
    'Could not search. Check your connection and try again.': 'Ricerca non riuscita. Controlla la connessione e riprova.',
    'Select your location. Add a region or country to the search if needed.': 'Seleziona la località. Aggiungi una regione o un paese, se necessario.',
    'No locations found. Try a nearby town or add a region or country.': 'Nessuna località trovata. Prova una città vicina o aggiungi una regione o un paese.',
    'Speed': 'Velocità',
    '▶  Preview': '▶  Anteprima',
    'Big': 'Grandi',
    'Small': 'Piccole',
    'No time': 'Nascondi ora',
    'No date': 'Nascondi data',
    '(12-hour)': '(12 ore)',
    '(24-hour)': '(24 ore)',
    'Add apps': 'Aggiungi app',
    'Samsung app store': 'Store applicazioni Samsung',
    'Add a name': 'Aggiungi un nome',
    'Fireplace': 'Caminetto',
    // Tested action-menu strings shared with the independent favourites PR.
    'Move': 'Sposta',
    'Add to Home': 'Aggiungi alla Home',
    'Remove from Home': 'Rimuovi dalla Home',
    'App actions': 'Azioni applicazione',
    // Clock labels used when the independent clock-layout PR is integrated.
    'Clock layout': 'Impaginazione orologio',
    'Clock style': 'Stile orologio',
    'Classic AeroTizen': 'Classica AeroTizen',
    'Custom': 'Personalizzata',
    'Large vertical': 'Verticale grande',
    'Horizontal': 'Orizzontale',
    'Thin': 'Sottile',
    'Bold': 'Grassetto',
    'Weather, date and time on one line': 'Meteo, data e ora in una riga',
    'Large clock, with weather below': 'Orologio grande, con meteo sotto',
    // Existing weather descriptions from the independently tested custom widget.
    'Weather unavailable': 'Meteo non disponibile',
    'Clear': 'Sereno',
    'Mainly clear': 'Prevalentemente sereno',
    'Partly cloudy': 'Parzialmente nuvoloso',
    'Cloudy': 'Nuvoloso',
    'Fog': 'Nebbia',
    'Drizzle': 'Pioviggine',
    'Rain': 'Pioggia',
    'Snow': 'Neve',
    'Showers': 'Rovesci',
    'Thunderstorm': 'Temporale',
    'Use the arrows to move it, OK to drop': 'Usa le frecce per spostare, OK per confermare',
    'Previewing. Press any key to return': 'Anteprima. Premi un tasto per tornare',
    'Offline': 'Offline',
    'Muted': 'Silenzioso',
    'Volume ': 'Volume ',
    'Would open ': 'Aprirebbe ',
    'Could not open ': 'Impossibile aprire ',
    'Would switch to ': 'Passerebbe a ',
    'Could not show ': 'Impossibile mostrare ',
    'Could not switch input': 'Impossibile cambiare sorgente',
    'Would open the Samsung app store': 'Aprirebbe lo Store Samsung',
    'Could not open the app store': 'Impossibile aprire lo Store Samsung',
    'Press Home to open Samsung Home': 'Premi Home per aprire la Home Samsung',
    'Deep Sea': 'Mare profondo',
    'Golden Hour': 'Ora dorata',
    'Calm': 'Calma',
    'Snowfall': 'Nevicata',
    'Fireflies': 'Lucciole',
    'Ocean Waves': 'Onde oceaniche',
    'Black': 'Nero',
    'Midnight': 'Mezzanotte',
    'Dusk': 'Crepuscolo',
    'Forest': 'Foresta',
    'Sunset': 'Tramonto',
    'Navy': 'Blu notte',
    'Plum': 'Prugna',
    'Wine': 'Vino',
    'Rose': 'Rosa',
    'Arctic': 'Artico',
    'Mint': 'Menta',
    'Slate': 'Ardesia',
    'Teal Night': 'Notte petrolio',
    // Opt-in V992.56 photographic backgrounds and original branded cards.
    'Weather wallpaper': 'Sfondo meteo',
    'Off': 'Disattivato',
    'Automatic (weather)': 'Automatico (meteo)',
    'Home tile layout': 'Layout tessere Home',
    'Apps per row': 'App per riga',
    'App card shape': 'Forma delle tessere',
    'Square': 'Quadrato',
    'Rectangle': 'Rettangolo',
    'Default': 'Predefinito',
    '3 per row': '3 per riga',
    '4 per row': '4 per riga',
    '5 per row': '5 per riga'
  };
  var lang = 'en', locale = 'en-GB', onChange = null;

  function normalize(raw) {
    raw = typeof raw === 'string' ? raw.toLowerCase().replace(/_/g, '-') : '';
    return /^(it|ita)(-|$)/.test(raw) ? 'it' : 'en';
  }

  function toLocale(raw) {
    var code = normalize(raw), lower = typeof raw === 'string' ? raw.toLowerCase().replace(/_/g, '-') : '';
    if (code === 'it') { return 'it-IT'; }
    if (lower.indexOf('en-us') === 0) { return 'en-US'; }
    return 'en-GB';
  }

  function t(english) {
    return lang === 'it' && Object.prototype.hasOwnProperty.call(italian, english)
      ? italian[english] : english;
  }

  function displayMessage(message) {
    var translated = t(message);
    if (translated !== message) { return translated; }
    var prefixes = ['Would open ', 'Could not open ', 'Would switch to ',
      'Could not show ', 'Volume ', 'Location: '];
    for (var i = 0; i < prefixes.length; i++) {
      if (message.indexOf(prefixes[i]) === 0) {
        return t(prefixes[i]) + message.slice(prefixes[i].length);
      }
    }
    return message;
  }

  function label(key, value) {
    // Names originating from a TV or a weather search are never UI translations.
    if (key === 'time:none' || key === 'date:none') { return t(value); }
    if (key.indexOf('weather:result:') === 0 || key.indexOf('name:') === 0 ||
        key.indexOf('date:') === 0) { return value; }
    if (key.indexOf('time:') === 0) {
      return value.replace('  (12-hour)', '  ' + t('(12-hour)'))
        .replace('  (24-hour)', '  ' + t('(24-hour)'));
    }
    return t(value);
  }

  function applyStatic() {
    if (!document || !document.querySelectorAll) { return; }
    document.documentElement.lang = lang;
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
  }

  function set(raw) {
    var code = normalize(raw), nextLocale = toLocale(raw);
    var changed = code !== lang || nextLocale !== locale;
    lang = code; locale = nextLocale;
    applyStatic();
    if (changed && onChange) { onChange(); }
  }

  function refresh() {
    var tz = A.tizen;
    if (!tz || !tz.systeminfo || !tz.systeminfo.getPropertyValue) { return; }
    try {
      tz.systeminfo.getPropertyValue('LOCALE', function (data) {
        if (data && typeof data.language === 'string' && data.language) { set(data.language); }
      }, function () { /* navigator.language remains the fallback */ });
    } catch (e) { /* unsupported on some TVs */ }
  }

  function start(callback) {
    onChange = callback || null;
    var nav = window.navigator || {};
    set(nav.language || (nav.languages && nav.languages[0]) || 'en');
    refresh();
  }

  A.i18n = { start: start, refresh: refresh, t: t, label: label,
    displayMessage: displayMessage, code: function () { return lang; },
    locale: function () { return locale; }, normalize: normalize };
})(window.AeroTizen);
