import en from "./en.json";
import ru from "./ru.json";

export type MessageKey = keyof typeof en;

const english = { name: "English", messages: en };
const russian = { name: "Русский", messages: ru };
export const catalogues: Readonly<Record<string, { name: string; messages: Partial<Record<MessageKey, string>> }>> = {
  en: english,
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
