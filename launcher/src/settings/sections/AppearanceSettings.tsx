import { useTranslation } from "../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { SettingsSection } from "../components/SettingsSection/SettingsSection";
import type { SettingsSectionProps } from "../types";

const APPEARANCE_OPTIONS = [
  { value: "classic", labelKey: "appearance.classic" },
  { value: "glass", labelKey: "appearance.glass" },
  { value: "gloss", labelKey: "appearance.gloss" },
] as const;

const HOME_CARD_COLUMNS_OPTIONS = [
  { value: "5", labelKey: "appearance.small" },
  { value: "4", labelKey: "appearance.medium" },
  { value: "3", labelKey: "appearance.large" },
] as const;

const HOME_APP_LAYOUT_OPTIONS = [
  { value: "grid", labelKey: "appearance.grid" },
  { value: "scroll", labelKey: "appearance.scroll" },
] as const;

const PERFORMANCE_OPTIONS = [
  { value: false, labelKey: "common.off" },
  { value: true, labelKey: "common.on" },
] as const;

export const AppearanceSettings = ({ settings, actions }: SettingsSectionProps) => {
  const { t } = useTranslation();
  return (
    <>
      <SettingsSection title={t("appearance.title")}>
        <ChoiceGroup
          id="settings-appearance"
          label={t("appearance.title")}
          value={settings.theme}
          options={APPEARANCE_OPTIONS}
          onSelect={actions.setTheme}
        />
      </SettingsSection>
      <SettingsSection title={t("appearance.size")}>
        <ChoiceGroup
          id="home-card-columns"
          label={t("appearance.size")}
          value={String(settings.homeCardColumns)}
          options={HOME_CARD_COLUMNS_OPTIONS}
          onSelect={(value) => actions.setHomeCardColumns(Number(value))}
        />
      </SettingsSection>
      <SettingsSection title={t("appearance.homeLayout")}>
        <ChoiceGroup
          id="home-app-layout"
          label={t("appearance.homeLayout")}
          value={settings.homeAppLayout}
          options={HOME_APP_LAYOUT_OPTIONS}
          onSelect={actions.setHomeAppLayout}
        />
      </SettingsSection>
      <SettingsSection title={t("appearance.performanceMode")} description={t("appearance.performanceHint")}>
        <ChoiceGroup
          id="performance-mode"
          label={t("appearance.performanceMode")}
          value={settings.performanceMode}
          options={PERFORMANCE_OPTIONS}
          onSelect={actions.setPerformanceMode}
        />
      </SettingsSection>
    </>
  );
};
