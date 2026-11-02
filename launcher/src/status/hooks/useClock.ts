import type { ClockService } from "../../contracts/launcher";
import type { SettingsSnapshot } from "../../contracts/preferences";
import { useStore } from "../../shared/hooks/useStore";
import type { Store } from "../../shared/state/createStore";

export const useClock = (time: Store<number>, clock: ClockService, settings: SettingsSnapshot) => {
  const timestamp = useStore(time);
  const now = new Date(timestamp);
  const text = clock.formatTime(now, settings.timeFormat);
  const date = clock.formatDate(now, settings.dateFormat);
  const fields = clock.formatTimeParts?.(now, settings.timeFormat);
  const parts = /^([^:：.]+)[:：.]([^\s]+)(.*)$/.exec(text);
  return {
    timestamp,
    text,
    date,
    hour: fields ? fields.hour : parts ? parts[1] : text,
    minute: fields ? fields.minute : parts ? parts[2] : "",
    period: fields ? (fields.dayPeriod ? " " + fields.dayPeriod : "") : parts?.[3],
  };
};
