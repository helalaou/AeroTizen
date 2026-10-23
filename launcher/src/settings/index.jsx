import { h, Fragment, render } from 'preact';
import { useMemo } from 'preact/hooks';
import { BackgroundSettings } from './backgrounds.jsx';
import { WeatherSettings } from './weather.jsx';
import { DisplaySettings } from './display.jsx';
import { InputSettings } from './inputs.jsx';
import { AppMenu } from './apps.jsx';
import { createNavigation } from './navigation.js';
import { createSettingsController } from './controller.js';

function Settings({ A, settings, search, actions }) {
  // App artwork mounts once. Unrelated changes do not visit the app list.
  const apps = useMemo(() => (
    <AppMenu home={settings.home} apps={A.apps.all} actions={actions} tiles={A.tiles}
      fireplaceId={A.config.FIREPLACE_ID} />
  ), [settings.home, A.apps.all, actions, A.tiles, A.config.FIREPLACE_ID]);

  return (
    <>
      <h2>Settings</h2>
      <BackgroundSettings settings={settings} actions={actions} config={A.config} />
      <WeatherSettings settings={settings} search={search} actions={actions} />
      <DisplaySettings settings={settings} actions={actions} clock={A.clock} />
      <InputSettings settings={settings} actions={actions} sources={A.inputs.sources} portName={A.inputs.portName} />
      {apps}
      <div id="escape" class="escape" data-key="escape" role="button" onClick={actions.useSamsungHome}>
        Use Samsung Home instead
      </div>
    </>
  );
}

const A = window.AeroTizen;
const navigation = createNavigation(A);
const controller = createSettingsController(A, navigation, snapshot => {
  // Synchronous root rendering keeps the DOM ready for the next remote event.
  render(<Settings A={A} {...snapshot} actions={controller.actions} />, A.$('editor'));
});
A.settingsUi = controller;
window.addEventListener('resize', controller.resize);
