import { createRef, render } from 'preact';
import { flushSync } from 'preact/compat';
import { createStore } from '../shared/state/createStore';
import { createSettingsStore } from '../settings/state/createSettingsStore';
import { createHomeController } from './state/createHomeController';
import { Home } from './Home';
import type { HomeRuntime, Inventory } from './types';

const runtime = window.AeroTizen as unknown as HomeRuntime;
const mount = document.getElementById('home-root');
if (!mount) {throw new Error('Home mount point is missing.');}
const settings = createSettingsStore(runtime.settings, { ...runtime.config.DEFAULTS, home: [], tempUnit: 'C', timeFormat: '12' });
const inventory = createStore<Inventory>({ apps: [], inputs: [], items: [], ready: false });
const rows = createRef<HTMLElement>();
const environment = createHomeController({ runtime, settings, inventory, rows, nodes: new Map(),
  translate: value => runtime.i18n?.t(value) || value,
  describe: app => runtime.tiles.describe(app),
  columns: values => runtime.config.CARD_COLUMNS[values.cardSize === 'small' ? 'small' : 'big']
}, flushSync);
const refresh = () => flushSync(() => {
  const inputs = runtime.inputs.sources.filter(source => runtime.inputs.isVisible ? runtime.inputs.isVisible(source) :
    source.type === 'TV' ? runtime.settings.showLiveTv !== false : !(runtime.settings.hideDisconnectedHdmi && source.type === 'HDMI' && source.connected === false));
  inventory.set({ apps: runtime.apps.all, inputs, items: runtime.continueWatching.items, ready: runtime.apps.ready });
});
const originalRender = runtime.inputs.render;
runtime.inputs.render = refresh;
runtime.homeScreen = { ...environment.bridge,
  render() { refresh(); environment.bridge.focus(); },
  buildRows() { refresh(); environment.bridge.focus(); },
  refreshApps() { refresh(); environment.bridge.focus(); }
};
const unsubscribers = [runtime.apps.subscribe(refresh), runtime.inputs.subscribe(refresh), runtime.continueWatching.subscribe(refresh), settings.subscribe(refresh)];
render(<Home env={environment} />, mount);
// Native app handoffs may consume OK's release. Never carry a held press/menu
// into the next visible session; return focus through the existing bridge.
const visibility = () => document.hidden ? environment.bridge.blur() : environment.bridge.focus();
document.addEventListener('visibilitychange', visibility);
if (import.meta.hot) {import.meta.hot.dispose(() => {
  document.removeEventListener('visibilitychange', visibility);
  environment.bridge.blur(); render(null, mount); settings.dispose(); unsubscribers.forEach(unsubscribe => unsubscribe()); runtime.inputs.render = originalRender;
});}
