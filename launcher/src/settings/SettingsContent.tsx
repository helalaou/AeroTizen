import { useMemo } from "preact/hooks";

import { useStore } from "../shared/hooks/useStore";

import { SettingsControl } from "./components/SettingsControl";
import { useSettingsEnvironment } from "./hooks/useSettingsEnvironment";
import { useSettingsNavigation } from "./hooks/useSettingsNavigation";
import { SettingsDrawer } from "./layout/SettingsDrawer";
import { AppearanceSettings } from "./sections/AppearanceSettings";
import { HomeAppsSettings } from "./sections/apps/HomeAppsSettings";
import { BackgroundSettings } from "./sections/BackgroundSettings";
import { ClockSettings } from "./sections/ClockSettings";
import { ContinueWatchingSettings } from "./sections/ContinueWatchingSettings";
import { InputSettings } from "./sections/inputs/InputSettings";
import { WeatherSettings } from "./sections/weather/WeatherSettings";

export const SettingsContent = ({
  active,
  previewing,
  openedAt,
}: {
  active: boolean;
  previewing: boolean;
  openedAt: number;
}) => {
  const { settings: store, inventory, services, actions } = useSettingsEnvironment();
  const settings = useStore(store);
  const { apps, inputs, continueSources, continueMessage } = useStore(inventory);
  const webGL = useStore(services.backgroundWebGL);
  const animated = services.backgrounds.some(
    (background) =>
      background.id === settings.background &&
      Boolean(background.anim) &&
      (!background.requiresWebGL || webGL !== false),
  );
  const locationLabel = settings.weatherLocation?.label || settings.weatherLocation?.name;
  useSettingsNavigation(active, previewing, {
    apps,
    inputs,
    continueSources,
    continueMessage,
    continueEnabled: settings.continueWatching,
    animated,
    locationLabel,
    clockLayout: settings.clockLayout,
  });
  const homeApps = useMemo(
    () => (
      <HomeAppsSettings
        home={settings.home}
        apps={apps}
        actions={actions}
        active={active}
        describeApp={services.describeApp}
        fireplaceId={services.config.FIREPLACE_ID}
      />
    ),
    [settings.home, apps, actions, active, services],
  );
  return (
    <SettingsDrawer
      panes={{
        appearance: <AppearanceSettings settings={settings} actions={actions} />,
        apps: (
          <>
            {homeApps}
            <ContinueWatchingSettings
              settings={settings}
              actions={actions}
              sources={continueSources}
              message={continueMessage}
              active={active}
              describeApp={services.describeApp}
            />
            <SettingsControl
              id="escape"
              class="escape"
              focusKey="escape"
              role="button"
              onClick={actions.useSamsungHome}
            >
              {services.translate("Use Samsung Home instead")}
            </SettingsControl>
          </>
        ),
        wallpaper: (
          <BackgroundSettings
            settings={settings}
            actions={actions}
            config={services.config}
            backgrounds={services.backgrounds}
            webGL={webGL}
          />
        ),
        status: (
          <>
            <WeatherSettings settings={settings} actions={actions} active={active} />
            <ClockSettings settings={settings} actions={actions} clock={services.clock} openedAt={openedAt} />
          </>
        ),
        sources: <InputSettings settings={settings} actions={actions} inputs={inputs} />,
      }}
    />
  );
};
