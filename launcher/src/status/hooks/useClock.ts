import type { ClockService } from "../../contracts/launcher";
import type { SettingsSnapshot, TimeFormat } from "../../contracts/preferences";
import { useStore } from "../../shared/hooks/useStore";
import type { Store } from "../../shared/state/createStore";
import { zonedDate } from "../../shared/time/zonedDate";

const getTimeFields = (clock: ClockService, now: Date, format: TimeFormat, text: string) => {
  const fields = clock.formatTimeParts?.(now, format);
  if (fields) {
    return { hour: fields.hour, minute: fields.minute, period: fields.dayPeriod ? " " + fields.dayPeriod : "" };
  }
  const parts = /^([^:：.]+)[:：.]([^\s]+)(.*)$/.exec(text);
  return { hour: parts?.[1] ?? text, minute: parts?.[2] ?? "", period: parts?.[3] };
};

export const useClock = (time: Store<number>, clock: ClockService, settings: SettingsSnapshot, timeZone = "") => {
  const timestamp = useStore(time);
  const now = zonedDate(timestamp, timeZone);
  const text = settings.showTime ? clock.formatTime(now, settings.timeFormat) : "";
  const fields = settings.showTime
    ? getTimeFields(clock, now, settings.timeFormat, text)
    : { hour: "", minute: "", period: "" };
  return {
    timestamp,
    text,
    date: settings.dateFormat === "none" ? "" : clock.formatDate(now, settings.dateFormat),
    ...fields,
  };
};
