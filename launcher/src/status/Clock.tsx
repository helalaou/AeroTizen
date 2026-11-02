import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

import type { ClockService } from "../contracts/launcher";
import type { SettingsSnapshot } from "../contracts/preferences";
import type { ClockLayout } from "../contracts/status";

import type { useClock } from "./hooks/useClock";
import { useClockWidth } from "./hooks/useClockWidth";

// Layout controls presentation only. All variants share the same formatted data.
export const Clock = ({
  layout,
  settings,
  clock,
  value,
  children,
}: {
  layout: ClockLayout;
  settings: Pick<SettingsSnapshot, "showTime" | "dateFormat" | "showWeather" | "timeFormat" | "glassSettings">;
  clock: ClockService;
  value: ReturnType<typeof useClock>;
  children: ComponentChildren;
}) => {
  const time = useRef<HTMLSpanElement>(null);
  const width = useClockWidth(time, clock, settings.timeFormat, value.timestamp, layout + ":" + settings.glassSettings);
  return layout === "compact" ? (
    <>
      {children}
      <span id="date" class="date" hidden={settings.dateFormat === "none"}>
        {value.date}
      </span>
      <span
        id="time"
        class="time"
        ref={time}
        hidden={!settings.showTime}
        data-format={settings.timeFormat}
        style={{ width }}
      >
        {value.text}
      </span>
    </>
  ) : (
    <div id="custom-clock-root">
      <div
        id="aero-v991-widget"
        class={layout === "vertical" ? "" : "style-" + layout}
        hidden={!settings.showTime && settings.dateFormat === "none" && !settings.showWeather}
      >
        <div class="aero-v991-digits" aria-label={value.text} hidden={!settings.showTime}>
          <span id="aero-v991-hours" class="aero-v991-digit">
            {value.hour}
          </span>
          <span id="aero-v991-minutes" class="aero-v991-digit">
            {value.minute}
            <small style={{ fontSize: ".2em", letterSpacing: 0 }}>{value.period}</small>
          </span>
        </div>
        <div id="aero-v991-date" class="aero-v991-date" hidden={settings.dateFormat === "none"}>
          {value.date}
        </div>
        {children}
      </div>
    </div>
  );
};
