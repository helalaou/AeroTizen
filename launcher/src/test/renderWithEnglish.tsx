import { render } from "@testing-library/preact";
import type { ComponentChildren, VNode } from "preact";

import { createTranslations } from "../shared/i18n/createTranslations";
import { TranslationContext } from "../shared/i18n/useTranslation";

export const renderWithEnglish = (ui: VNode) => {
  const translations = createTranslations("en");
  const English = ({ children }: { children?: ComponentChildren }) => (
    <TranslationContext.Provider value={translations}>{children}</TranslationContext.Provider>
  );
  return render(ui, { wrapper: English });
};
