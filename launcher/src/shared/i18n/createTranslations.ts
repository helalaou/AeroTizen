import type { Resource } from "i18next";
import { createInstance } from "i18next";

import type { Store } from "../state/createStore";
import { createStore } from "../state/createStore";

import type { MessageKey } from "./catalogues";
import { catalogues, fallbackLanguage } from "./catalogues";

export type Translate = (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;

interface TranslationSnapshot {
  readonly language: string;
  readonly t: Translate;
}

export type Translations = Store<TranslationSnapshot>;

export const createTranslations = (initialLanguage: string) => {
  const engine = createInstance();
  const resources: Resource = {};
  for (const [language, catalogue] of Object.entries(catalogues)) {
    resources[language] = { translation: catalogue.messages };
  }
  // Packaged resources allow synchronous initialization before either screen mounts.
  void engine.init({
    initAsync: false,
    lng: initialLanguage,
    fallbackLng: fallbackLanguage,
    keySeparator: false,
    interpolation: { escapeValue: false }, // All consumers write text or Preact attributes.
    resources,
  });
  const snapshot = (language: string): TranslationSnapshot => {
    const translate = engine.getFixedT(language);
    return { language, t: (key, values) => translate(key, { replace: values }) };
  };
  const store = createStore(snapshot(initialLanguage));
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    setLanguage(language: string) {
      if (language !== store.getSnapshot().language) {
        store.set(snapshot(language));
      }
    },
  };
};
