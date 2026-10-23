import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { BackgroundSettings } from './BackgroundSettings.jsx';
import { WeatherSettings } from './WeatherSettings.jsx';
import { DisplaySettings } from './DisplaySettings.jsx';
import { InputSettings } from './InputSettings.jsx';
import { AppMenu } from './AppMenu.jsx';

export const Settings = ({ A, settings, search, actions }) => {
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
};
