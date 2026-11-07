import type { ClockPlatform } from "../../contracts/launcher";
import type { SettingsValues } from "../../contracts/preferences";

interface ClockHost {
  document: Pick<Document, "documentElement">;
  Intl: Pick<typeof Intl, "DateTimeFormat">;
  navigator: Pick<Navigator, "language" | "languages">;
  tizen?: {
    time?: { getDateFormat?(short: boolean): unknown; getTimeFormat?(): unknown };
  };
}

const systemPattern = (read: () => unknown) => {
  try {
    const pattern = read();
    if (typeof pattern === "string") {
      return pattern;
    }
  } catch {
    // Older TVs may not expose the system format.
  }
  return "";
};

export const createClockPlatform = (host: ClockHost, numerals: () => SettingsValues["numerals"]): ClockPlatform => ({
  getDatePattern: () => systemPattern(() => host.tizen?.time?.getDateFormat?.(true)),
  getTimePattern: () => systemPattern(() => host.tizen?.time?.getTimeFormat?.()),
  getLocales() {
    const { language, languages } = host.navigator;
    const system = languages ? [...languages] : [language].filter(Boolean);
    const chosen = host.document.documentElement.lang;
    // English keeps the TV's regional formats. Other selections lead the locale list.
    if (!chosen || chosen === "en") {
      return system;
    }
    return [/^ar\b/.test(chosen) ? chosen + "-u-nu-" + numerals() : chosen, ...system];
  },
  dateTimeFormat: (locales, options) => new host.Intl.DateTimeFormat(locales.length ? locales : undefined, options),
});
