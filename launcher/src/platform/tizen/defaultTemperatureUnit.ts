export interface LocaleIntl {
  Locale?: new (tag: string) => { maximize(): { region?: string } };
}

// Preserve CLDR weather units and explicit Unicode locale overrides on older TVs.
export const defaultTemperatureUnit = (locales: readonly (string | undefined)[], intl: unknown): "C" | "F" => {
  const localeIntl = intl as LocaleIntl | null | undefined;
  for (const locale of locales) {
    if (!locale) {
      continue;
    }
    const tag = locale.replace(/_/g, "-").toLowerCase();
    const tokens = tag.split("-");
    let extension = "";
    for (let index = 1; index < tokens.length; index++) {
      if (tokens[index] === "x") {
        break;
      }
      if (tokens[index] !== "u") {
        continue;
      }
      for (index++; index < tokens.length && tokens[index].length > 1; index++) {
        extension += "-" + tokens[index];
      }
      break;
    }
    const unit = extension.match(/-mu-(celsius|fahrenhe)(?:-|$)/);
    if (unit) {
      return unit[1] === "fahrenhe" ? "F" : "C";
    }
    const override = extension.match(/-rg-([a-z]{2}|\d{3})zzzz(?:-|$)/);
    const explicit = tag.split(/-[a-z0-9]-/)[0].match(/-([a-z]{2}|\d{3})(?:-|$)/);
    let region = (override || explicit)?.[1] || "";
    try {
      if (!region && localeIntl?.Locale) {
        region = new localeIntl.Locale(tag).maximize().region || "";
      }
    } catch {
      // Explicit regions still work when Intl.Locale is unavailable.
    }
    if (region) {
      return /^(BS|BZ|KY|PR|PW|US)$/.test(region.toUpperCase()) ? "F" : "C";
    }
  }
  return "C";
};
