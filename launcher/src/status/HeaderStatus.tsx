import type { ClockService } from "../contracts/launcher";
import type { SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import { useStore } from "../shared/hooks/useStore";

import { Clock } from "./Clock";
import { useClock } from "./hooks/useClock";
import { useWeather } from "./hooks/useWeather";
import { WeatherStatus } from "./WeatherStatus";

export const HeaderStatus = ({
  settings: store,
  status,
  clock,
  translate,
}: {
  settings: SettingsStore;
  status: StatusStores;
  clock: ClockService;
  translate(value: string): string;
}) => {
  const settings = useStore(store);
  const value = useClock(status.time, clock, settings);
  const weather = useWeather(status.weather, translate);
  const layout = settings.clockLayout === "custom" ? settings.aeroClockStyle : "compact";
  return (
    <div class={"topbar-right" + (!settings.showTime && settings.dateFormat === "none" ? " weather-only" : "")}>
      <Clock layout={layout} settings={settings} clock={clock} value={value}>
        <WeatherStatus
          variant={layout === "compact" ? "compact" : "expanded"}
          weather={weather}
          showWeather={settings.showWeather}
          showLocation={settings.weatherShowLocation}
        />
      </Clock>
    </div>
  );
};
