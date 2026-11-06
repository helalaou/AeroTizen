import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

import type { ClockService } from "../../contracts/launcher";
import type { SettingsSnapshot } from "../../contracts/preferences";
import type { ClockLayout } from "../../contracts/status";
import type { useClock } from "../hooks/useClock";
import { useClockWidth } from "../hooks/useClockWidth";

import styles from "./Clock.module.css";

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
      <span id="date" class={styles.compactDate} hidden={settings.dateFormat === "none"}>
        {value.date}
      </span>
      <span
        id="time"
        class={styles.compactTime}
        ref={time}
        hidden={!settings.showTime}
        data-format={settings.timeFormat}
        style={{ width }}
      >
        {value.text}
      </span>
    </>
  ) : (
    <div data-clock-container>
      <div
        class={styles.expanded + " " + styles[layout]}
        data-clock="expanded"
        data-clock-layout={layout}
        hidden={!settings.showTime && settings.dateFormat === "none" && !settings.showWeather}
      >
        <div class={styles.digits} data-clock-part="time" aria-label={value.text} hidden={!settings.showTime}>
          <span class={styles.digit + " " + styles.hours} data-clock-part="hours">
            {value.hour}
          </span>
          <span class={styles.digit} data-clock-part="minutes">
            {value.minute}
            <small class={styles.period}>{value.period}</small>
          </span>
        </div>
        <div class={styles.date} data-clock-part="date" hidden={settings.dateFormat === "none"}>
          {value.date}
        </div>
        {children}
      </div>
    </div>
  );
};
