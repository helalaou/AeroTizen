import { useMemo } from 'preact/hooks';
import { useStore } from '../shared/hooks/useStore';
import { BackgroundSettings } from './BackgroundSettings';
import { WeatherSettings } from './WeatherSettings';
import { DisplaySettings } from './DisplaySettings';
import { InputSettings } from './InputSettings';
import { AppMenu } from './AppMenu';
import { useSettingsEnvironment } from './hooks/useSettingsEnvironment';
import { useSettingsNavigation } from './hooks/useSettingsNavigation';
import type { JSX } from 'preact';

export const Settings = ({ active, previewing }: { active: boolean; previewing: boolean }) => {
  const { settings: store, services, actions, navigation } = useSettingsEnvironment();
  const settings = useStore(store, active);
  useSettingsNavigation(active, previewing);
  const apps = services.getApps();
  const appMenu = useMemo(() => (
    <AppMenu home={settings.home} apps={apps} actions={actions} active={active}
      describeApp={services.describeApp} fireplaceId={services.config.FIREPLACE_ID} />
  ), [settings.home, apps, actions, active, services]);
  const select = (event: JSX.TargetedEvent<HTMLDivElement, Event>) => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-key]') : null;
    if (element) { navigation.select(element.dataset.key); navigation.focus(); }
  };
  return (
    <div onClickCapture={select} onFocusCapture={select}>
      <h2>Settings</h2>
      <BackgroundSettings settings={settings} actions={actions} config={services.config} backgrounds={services.backgrounds} />
      <WeatherSettings settings={settings} actions={actions} active={active} />
      <DisplaySettings settings={settings} actions={actions} clock={services.clock} />
      <InputSettings settings={settings} actions={actions} inputs={services.getInputs()} />
      {appMenu}
      <div id="escape" class="escape" data-key="escape" role="button" onClick={actions.useSamsungHome}>
        Use Samsung Home instead
      </div>
    </div>
  );
};
