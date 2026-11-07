import ar from "./ar.json";
import en from "./en.json";
import fr from "./fr.json";
import it from "./it.json";
import ru from "./ru.json";

export type MessageKey = keyof typeof en;

const arabic = { name: "العربية", messages: ar, direction: "rtl" as const };
const english = { name: "English", messages: en };
const french = { name: "Français", messages: fr };
const italian = { name: "Italiano", messages: it };
const russian = { name: "Русский", messages: ru };

export const catalogues: Readonly<
  Record<string, { name: string; messages: Partial<Record<MessageKey, string>>; direction?: "rtl" }>
> = {
  ar: arabic,
  en: english,
  fr: french,
  it: italian,
  ru: russian,
};
export const fallbackLanguage = "en";

export const resolveLanguage = (preference: unknown, systemLanguages: readonly string[]) => {
  const requested =
    typeof preference === "string" && preference !== "auto" ? [preference, ...systemLanguages] : systemLanguages;
  const supported = Object.keys(catalogues);
  for (const locale of requested) {
    const parts = locale.replace(/_/g, "-").toLowerCase().split("-");
    while (parts.length > 0) {
      const tag = parts.join("-");
      const match = supported.find((language) => language.toLowerCase() === tag);
      if (match) {
        return match;
      }
      parts.pop();
    }
  }
  return fallbackLanguage;
};
