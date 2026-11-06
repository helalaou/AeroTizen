import { catalogues } from "../../shared/i18n/catalogues";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { SettingsSection } from "../components/SettingsSection/SettingsSection";
import { useSettingsEnvironment } from "../hooks/useSettingsEnvironment";

const languages = Object.entries(catalogues).map(([value, catalogue]) => ({ value, label: catalogue.name }));

export const LanguageSettings = ({ language }: { language: string }) => {
  const { settings } = useSettingsEnvironment();
  const { t } = useTranslation();
  return (
    <SettingsSection title={t("settings.language.hint")} description={t("settings.language.note")}>
      <ChoiceGroup
        id="language"
        label={t("settings.language.title")}
        value={languages.some((option) => option.value === language) ? language : "auto"}
        options={[{ value: "auto", label: t("settings.language.auto") }, ...languages]}
        onSelect={(language) => settings.update({ language })}
      />
    </SettingsSection>
  );
};
