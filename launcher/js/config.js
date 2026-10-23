// AeroTizen launcher behaviour and settings. App identities live in app-catalog.js.
window.AeroTizen = window.AeroTizen || {};

AeroTizen.config = {
  APP_ID: 'DclHome001.Home',
  SERVICE_ID: 'DclHome001.Watcher',
  SERVICE_URL: 'http://127.0.0.1:47790',

  STORAGE_KEY: 'aerotizen.settings.v1',
  LEGACY_STORAGE_KEYS: ['hearth.home.v1', 'declutter.home.v5'],

  // Remote control key codes (Tizen TV).
  KEY: { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, IME_DONE: 65376, IME_CANCEL: 65385 },

  // Apps placed on the home grid the first time, by name prefix, in this order.
  DEFAULT_HOME_APPS: ['youtube', 'netflix', 'prime video', 'stremio', 'spotify'],

  // Real user apps: Samsung-store packages (10-char ids) plus the preinstalled streamers,
  // which the TV's local API knows by their store ids. getAppsInfo() returns ~470 entries;
  // everything else is firmware plumbing.
  STORE_PACKAGE: /^[A-Za-z0-9]{10}$/,
  HIDDEN_APPS: /service|emanual|companion|dummy|widget|DclHome001/i,
  STORE_APP_IDS: ['org.volt.apps', 'com.samsung.tv.store'],
  HBBTV_APP_ID: 'org.tizen.hbbtv',
  HBBTV_LINK_METADATA: 'http://samsung.com/tv/metadata/hbbtv.link',

  FIREPLACE_ID: '__fire',
  FIREPLACE_VIDEO: 'WuHSBSLK3_A',

  CARD_COLUMNS: { big: 3, small: 5 },  // Settings → App cards
  LONG_PRESS_MS: 600,
  SPEED: { MIN: 0.25, MAX: 3, STEP: 0.25 },

  DEFAULTS: {
    home: null,  // null selects defaults on first launch; [] keeps an empty Home.
    cardSize: 'big',
    background: 'aurora',
    speed: 1,
    tempUnit: 'auto',
    weatherLocation: null,
    weatherShowLocation: true,
    dateFormat: 'weekday',
    timeFormat: '12',
    showLiveTv: true,
    hideDisconnectedHdmi: false,
    inputNames: {}
  }
};
