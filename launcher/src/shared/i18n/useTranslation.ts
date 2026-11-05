import { createContext } from "preact";
import { useContext } from "preact/hooks";

import { useStore } from "../hooks/useStore";

import type { Translations } from "./createTranslations";

export const TranslationContext = createContext<Translations | null>(null);

export const useTranslation = () => {
  const translations = useContext(TranslationContext);
  if (!translations) {
    throw new Error("Translation provider is missing.");
  }
  return useStore(translations);
};
