import { useMemo } from "preact/hooks";

import { useStore } from "../shared/hooks/useStore";

import { RemoteControl } from "./components/RemoteControl";
import { SettingsDrawer } from "./glass/GlassSettings";
import { useSettingsEnvironment } from "./hooks/useSettingsEnvironment";
import { useSettingsNavigation } from "./hooks/useSettingsNavigation";
import { AppMenu } from "./sections/apps/AppMenu";
import { BackgroundSettings } from "./sections/BackgroundSettings";
import { ContinueWatchingSettings } from "./sections/ContinueWatchingSettings";
import { DisplaySettings } from "./sections/DisplaySettings";
import { InputSettings } from "./sections/inputs/InputSettings";
import { WeatherSettings } from "./sections/weather/WeatherSettings";

export const Settings = ({
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
  const animated = services.backgrounds.some(
    (background) => background.id === settings.background && Boolean(background.anim),
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
  const appMenu = useMemo(
    () => (
      <AppMenu
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
        appearance: (
          <DisplaySettings
            settings={settings}
            actions={actions}
            clock={services.clock}
            openedAt={openedAt}
            section="appearance"
          />
        ),
        apps: (
          <>
            {appMenu}
            <ContinueWatchingSettings
              settings={settings}
              actions={actions}
              sources={continueSources}
              message={continueMessage}
              active={active}
              describeApp={services.describeApp}
            />
            <RemoteControl id="escape" class="escape" focusKey="escape" role="button" onClick={actions.useSamsungHome}>
              {services.translate("Use Samsung Home instead")}
            </RemoteControl>
          </>
        ),
        wallpaper: (
          <BackgroundSettings
            settings={settings}
            actions={actions}
            config={services.config}
            backgrounds={services.backgrounds}
          />
        ),
        status: (
          <>
            <WeatherSettings settings={settings} actions={actions} active={active} />
            <DisplaySettings
              settings={settings}
              actions={actions}
              clock={services.clock}
              openedAt={openedAt}
              section="status"
            />
          </>
        ),
        sources: (
          <>
            <DisplaySettings
              settings={settings}
              actions={actions}
              clock={services.clock}
              openedAt={openedAt}
              section="sources"
            />
            <InputSettings settings={settings} actions={actions} inputs={inputs} />
          </>
        ),
      }}
    />
  );
};
