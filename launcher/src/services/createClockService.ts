import type { ClockPlatform, ClockService } from "../contracts/launcher";
import type { DateFormat, SettingsValues, TimeFormat } from "../contracts/preferences";
import { createStore } from "../shared/state/createStore";

const TICK_INTERVAL_MS = 10_000;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (value: number) => String(value).padStart(2, "0");

const dateStyle = (format: SettingsValues["dateFormat"]): DateFormat => {
  if (format === "auto" || format === "weekday") {
    return "short";
  }
  if (format === "dmy" || format === "mdy") {
    return "numeric";
  }
  return format;
};

const numericToken = (date: Date, token: string) => {
  if (token[0] === "d") {
    return pad(date.getDate());
  }
  if (token[0] === "m") {
    return pad(date.getMonth() + 1);
  }
  return token.length === 2 ? pad(date.getFullYear() % 100) : String(date.getFullYear());
};

const timeText = (date: Date, format: TimeFormat, formatter: Intl.DateTimeFormat | null) => {
  try {
    if (formatter) {
      return formatter.format(date);
    }
  } catch {
    // Older runtimes can still render the selected hour cycle.
  }
  if (format === "24") {
    return pad(date.getHours()) + ":" + pad(date.getMinutes());
  }
  return (date.getHours() % 12 || 12) + ":" + pad(date.getMinutes()) + (date.getHours() < 12 ? " am" : " pm");
};

export const createClockService = ({
  platform,
  now,
  timers,
}: {
  platform: ClockPlatform;
  now: () => number;
  timers: Pick<Window, "setInterval">;
}): ClockService => {
  const localFormatter = (options: Intl.DateTimeFormatOptions) =>
    platform.dateTimeFormat(platform.getLocales(), options);
  const numericDate = (date: Date, omitYear: boolean) => {
    const pattern = platform.getDatePattern();
    const options: Intl.DateTimeFormatOptions = { month: "2-digit", day: "2-digit" };
    if (!omitYear) {
      options.year = /\byy\b/.test(pattern) ? "2-digit" : "numeric";
    }
    if (/^[dmy\s/.,-]+$/.test(pattern) && /d/.test(pattern) && /m/.test(pattern) && /y/.test(pattern)) {
      // Remove the year and its adjacent separator while keeping the TV's day/month order.
      const template = omitYear
        ? pattern.replace(/^[\s/.,-]*y+[\s/.,-]*|[\s/.,-]*y+[\s/.,-]*$/g, "").replace(/y+[\s/.,-]*/g, "")
        : pattern;
      try {
        const formatter = localFormatter(options);
        // TV patterns describe Gregorian fields. Other calendars can require an era or named month.
        if (typeof formatter.formatToParts !== "function" || formatter.resolvedOptions().calendar !== "gregory") {
          return formatter.format(date);
        }
        const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
        for (const { type, value } of formatter.formatToParts(date)) {
          parts[type] = value;
        }
        const { day, month, year, era } = parts;
        if (day && month && !era && (omitYear || year)) {
          const fields: Record<string, string> = { d: day, m: month, y: year ?? "" };
          return template.replace(/d+|m+|y+/g, (token) => fields[token[0]]);
        }
        return formatter.format(date);
      } catch {
        return template.replace(/d+|m+|y+/g, (token) => numericToken(date, token));
      }
    }
    try {
      return localFormatter(options).format(date);
    } catch {
      return pad(date.getDate()) + "/" + pad(date.getMonth() + 1) + (omitYear ? "" : "/" + date.getFullYear());
    }
  };
  const readableDate = (date: Date, style: "compact" | "short" | "long") => {
    const length = style === "long" ? "long" : "short";
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: length };
    if (style !== "compact") {
      options.weekday = length;
    }
    try {
      return localFormatter(options).format(date);
    } catch {
      // Keep readable labels and the system's date order on TVs without Intl.
      const month = MONTHS[date.getMonth()];
      const weekday = DAYS[date.getDay()];
      const monthLabel = style === "long" ? month : month.slice(0, 3);
      const weekdayLabel = style === "long" ? weekday : weekday.slice(0, 3);
      const label = /m.*d/.test(platform.getDatePattern())
        ? monthLabel + " " + date.getDate()
        : date.getDate() + " " + monthLabel;
      return style === "compact" ? label : weekdayLabel + ", " + label;
    }
  };
  const dateFormats: ClockService["DATE_FORMATS"] = [
    { id: "compact", format: (date) => readableDate(date, "compact") },
    { id: "short", format: (date) => readableDate(date, "short") },
    { id: "long", format: (date) => readableDate(date, "long") },
    { id: "numeric-short", format: (date) => numericDate(date, true) },
    { id: "numeric", format: (date) => numericDate(date, false) },
    { id: "iso", format: (date) => date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) },
    { id: "none", format: () => "" },
  ];
  const timeFormatter = (format: TimeFormat, locales?: string[]) => {
    try {
      const cycle = format === "24" ? "h23" : "h12";
      const options = { hour: format === "24" ? "2-digit" : "numeric", minute: "2-digit", hourCycle: cycle } as const;
      const formatter = platform.dateTimeFormat(locales ?? platform.getLocales(), options);
      const resolved = formatter.resolvedOptions();
      if ("hourCycle" in resolved && resolved.hourCycle === cycle) {
        return formatter;
      }
    } catch {
      // Some TV engines have no Intl or do not support explicit hour cycles.
    }
    return null;
  };
  const timeWidths = new Map<string, number>();
  // A tick also signals weather expiry and clock correction checks, even at the same millisecond.
  const store = createStore({ time: now() });
  const tick = () => store.set({ time: now() });
  let started = false;

  return {
    getSnapshot: () => store.getSnapshot().time,
    subscribe: store.subscribe,
    DATE_FORMATS: dateFormats,
    dateStyle,
    defaultTimeFormat() {
      const pattern = platform.getTimePattern();
      if (/h/.test(pattern) && /m/.test(pattern)) {
        return /ap/.test(pattern) ? "12" : "24";
      }
      try {
        const { hour12 } = localFormatter({ hour: "numeric", minute: "2-digit" }).resolvedOptions();
        if (typeof hour12 === "boolean") {
          return hour12 ? "12" : "24";
        }
      } catch {
        // Keep the original 12-hour default when the locale is unavailable.
      }
      return "12";
    },
    formatDate(date, format) {
      const style = dateStyle(format);
      return dateFormats.find(({ id }) => id === style)?.format(date) ?? readableDate(date, "short");
    },
    formatTime(date, format) {
      // A fresh formatter follows system time-zone changes without a page reload.
      return timeText(date, format, timeFormatter(format));
    },
    formatTimeParts(date, format) {
      const formatter = timeFormatter(format);
      if (!formatter || typeof formatter.formatToParts !== "function") {
        return null;
      }
      try {
        const fields = { hour: "", minute: "", dayPeriod: "" };
        for (const { type, value } of formatter.formatToParts(date)) {
          if (type === "hour" || type === "minute" || type === "dayPeriod") {
            fields[type] = value;
          }
        }
        return fields.hour && fields.minute ? fields : null;
      } catch {
        return null;
      }
    },
    measureTime(format, font, measureText) {
      const locales = platform.getLocales();
      const key = format + ":" + String(locales) + ":" + font;
      const cached = timeWidths.get(key);
      if (cached !== undefined) {
        return cached;
      }
      // Reserve width for all times of day once per locale, format and font.
      let width = measureText("0") * (format === "24" ? 5 : 8);
      const sample = new Date(2000, 0, 1);
      const formatter = timeFormatter(format, locales);
      for (let minute = 0; minute < 24 * 60; minute++) {
        sample.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        width = Math.max(width, measureText(timeText(sample, format, formatter)) + 1);
      }
      width = Math.ceil(width);
      timeWidths.set(key, width);
      return width;
    },
    tick,
    start() {
      if (started) {
        return;
      }
      started = true;
      tick();
      timers.setInterval(tick, TICK_INTERVAL_MS);
    },
  };
};
