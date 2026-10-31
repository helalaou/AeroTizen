import { RemoteControl } from './components/RemoteControl';
import { useMemo } from 'preact/hooks';
import { useStore } from '../shared/hooks/useStore';
import { BackgroundSettings } from './sections/BackgroundSettings';
import { WeatherSettings } from './sections/weather/WeatherSettings';
import { ContinueWatchingSettings } from './sections/ContinueWatchingSettings';
import { DisplaySettings } from './sections/DisplaySettings';
import { InputSettings } from './sections/inputs/InputSettings';
import { AppMenu } from './sections/apps/AppMenu';
import { useSettingsEnvironment } from './hooks/useSettingsEnvironment';
import { useSettingsNavigation } from './hooks/useSettingsNavigation';

export const Settings = ({ active, previewing, openedAt }: { active: boolean; previewing: boolean; openedAt: number }) => {
  const { settings: store, inventory, services, actions } = useSettingsEnvironment();
  const settings = useStore(store);
  const { apps, inputs, continueSources, continueMessage } = useStore(inventory);
  const animated = services.backgrounds.some(background => background.id === settings.background && Boolean(background.anim));
  const locationLabel = settings.weatherLocation?.label || settings.weatherLocation?.name;
  useSettingsNavigation(active, previewing, { apps, inputs, continueSources, continueMessage, continueEnabled: settings.continueWatching, animated, locationLabel, clockLayout: settings.clockLayout });
  const appMenu = useMemo(() => (
    <AppMenu home={settings.home} apps={apps} actions={actions} active={active}
      describeApp={services.describeApp} fireplaceId={services.config.FIREPLACE_ID} />
  ), [settings.home, apps, actions, active, services]);
  return (
    <>
      <h2>Settings</h2>
      <BackgroundSettings settings={settings} actions={actions} config={services.config} backgrounds={services.backgrounds} />
      <WeatherSettings settings={settings} actions={actions} active={active} />
      <DisplaySettings settings={settings} actions={actions} clock={services.clock} openedAt={openedAt} />
      <ContinueWatchingSettings settings={settings} actions={actions} sources={continueSources} message={continueMessage} active={active} describeApp={services.describeApp} />
      <InputSettings settings={settings} actions={actions} inputs={inputs} />
      {appMenu}
      <RemoteControl id="escape" class="escape" focusKey="escape" role="button" onClick={actions.useSamsungHome}>
        Use Samsung Home instead
      </RemoteControl>
    </>
  );
};
