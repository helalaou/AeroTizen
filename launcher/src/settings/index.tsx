import { createRef, render } from 'preact';
import { flushSync } from 'preact/compat';
import { createStore } from '../shared/state/createStore';
import { createNavigation } from '../shared/navigation/createNavigation';
import { createSettingsStore } from './state/createSettingsStore';
import { createSettingsServices } from './services/createSettingsServices';
import { createSettingsActions } from './actions';
import { createSettingsBridge } from './bridge';
import { collectSettingsRows } from './navigation';
import { SettingsProvider } from './SettingsProvider';
import { SettingsRoot } from './SettingsRoot';
import type { SettingsEnvironment, ViewState } from './types';

const runtime = window.AeroTizen;
const mount = document.getElementById('settings-root');
if (!mount) { throw new Error('Settings mount point is missing.'); }
const settings = createSettingsStore(runtime.settings, { ...runtime.config.DEFAULTS, home: [], tempUnit: 'C', timeFormat: '12' });
const view = createStore<ViewState>({ open: false, previewing: false, mounted: false });
const services = createSettingsServices(runtime);
const actions = createSettingsActions(settings, services, view, flushSync);
const bridge = createSettingsBridge(settings, view, services, flushSync);
const root = createRef<HTMLDivElement>();
const navigation = createNavigation(() => collectSettingsRows(root.current), element => {
  if (root.current) { root.current.scrollTop = Math.max(0, element.offsetTop - 640); }
});
const environment: SettingsEnvironment = { settings, view, services, actions, bridge, navigation, root };
runtime.settingsUi = bridge;
render(<SettingsProvider environment={environment}><SettingsRoot /></SettingsProvider>, mount);

if (import.meta.hot) {
  import.meta.hot.dispose(() => { render(null, mount); settings.dispose(); });
}
