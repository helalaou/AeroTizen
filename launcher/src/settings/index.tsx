import { CustomClock } from "../clock/CustomClock";
import { createRef, render } from 'preact';
import { flushSync } from 'preact/compat';
import { createStore } from '../shared/state/createStore';
import { createNavigation } from '../shared/navigation/createNavigation';
import { focusControl } from '../shared/navigation/focusControl';
import { createSettingsStore } from './state/createSettingsStore';
import { createSettingsServices } from './services/createSettingsServices';
import { createSettingsInventory } from './services/createSettingsInventory';
import { createSettingsActions } from './state/createSettingsActions';
import { createSettingsBridge } from './services/createSettingsBridge';
import { SettingsProvider } from './SettingsProvider';
import { SettingsRoot } from './SettingsRoot';
import type { SettingsEnvironment, ViewState } from './types';

const runtime = window.AeroTizen;
const mount = document.getElementById('settings-root');
if (!mount) { throw new Error('Settings mount point is missing.'); }
const settings = createSettingsStore(runtime.settings, { ...runtime.config.DEFAULTS, home: [], tempUnit: 'C', timeFormat: '12' });
const view = createStore<ViewState>({ open: false, previewing: false, mounted: false, openedAt: 0, adjusting: false });
const inventory = createSettingsInventory(runtime);
const services = createSettingsServices(runtime);
const actions = createSettingsActions(settings, services, view, flushSync);
const bridge = createSettingsBridge(settings, view, services, flushSync);
const root = createRef<HTMLDivElement>();
const navigation = createNavigation(element => {
  // A command can restore browser focus without changing the selected key (IME Done).
  focusControl(element);
  if (root.current) { root.current.scrollTop = Math.max(0, element.offsetTop - 640); }
});
const environment: SettingsEnvironment = { settings, inventory, view, services, actions, bridge, navigation, root };
runtime.settingsUi = bridge;
render(<SettingsProvider environment={environment}><SettingsRoot /></SettingsProvider>, mount);

if (import.meta.hot) {
  import.meta.hot.dispose(() => { render(null, mount); settings.dispose(); inventory.dispose(); if (clockMount) { render(null, clockMount); } });
}

// The clock is an optional presentation of existing shared status services.
const clockMount = document.getElementById('custom-clock-root');
if (clockMount) { render(<CustomClock settings={settings} clock={runtime.clock} />, clockMount); }
