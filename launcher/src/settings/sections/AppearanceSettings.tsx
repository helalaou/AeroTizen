import { APP_CARD_SIZE_OPTIONS } from "../../shared/apps/appCardSizes";
import { getHomeLayout, HOME_LAYOUT_OPTIONS } from "../../shared/homeLayout";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { SettingsField } from "../components/SettingsField/SettingsField";
import { SettingsToggle } from "../components/SettingsToggle/SettingsToggle";
import type { SettingsSectionProps } from "../types";

const APPEARANCE_OPTIONS = [
  { value: "classic", labelKey: "appearance.classic" },
  { value: "glass", labelKey: "appearance.glass" },
  { value: "pop", labelKey: "appearance.pop" },
  { value: "frost", labelKey: "appearance.frost" },
  { value: "gloss", labelKey: "appearance.gloss" },
  { value: "amethyst", labelKey: "appearance.amethyst" },
  { value: "mint", labelKey: "appearance.mint" },
  { value: "halo", labelKey: "appearance.halo" },
] as const;

const HOME_APP_LAYOUT_OPTIONS = [
  { value: "grid", labelKey: "appearance.grid" },
  { value: "scroll", labelKey: "appearance.scroll" },
] as const;

export const AppearanceSettings = ({ settings, actions }: SettingsSectionProps) => {
  const { t } = useTranslation();
  const appArrangement = getHomeLayout(settings.homeLayout).appArrangement;
  return (
    <>
      <SettingsField title={t("appearance.launcherLayout")}>
        <ChoiceGroup
          id="home-layout"
          label={t("appearance.launcherLayout")}
          value={settings.homeLayout}
          options={HOME_LAYOUT_OPTIONS}
          onSelect={actions.setHomeLayout}
        />
      </SettingsField>
      <SettingsField title={t("appearance.title")} topAligned>
        <ChoiceGroup
          id="settings-appearance"
          label={t("appearance.title")}
          value={settings.theme}
          options={APPEARANCE_OPTIONS}
          onSelect={actions.setTheme}
        />
      </SettingsField>
      <SettingsField title={t("appearance.size")}>
        <ChoiceGroup
          id="home-card-columns"
          label={t("appearance.size")}
          value={String(settings.homeCardColumns)}
          options={APP_CARD_SIZE_OPTIONS}
          onSelect={(value) => actions.setHomeCardColumns(Number(value))}
        />
      </SettingsField>
      <SettingsField title={t("appearance.homeLayout")} hidden={appArrangement !== "preference"}>
        <ChoiceGroup
          id="home-app-layout"
          label={t("appearance.homeLayout")}
          value={settings.homeAppLayout}
          options={HOME_APP_LAYOUT_OPTIONS}
          onSelect={actions.setHomeAppLayout}
        />
      </SettingsField>
      <SettingsField title={t("appearance.performanceMode")} description={t("appearance.performanceHint")}>
        <SettingsToggle
          focusKey="performance-mode"
          label={t("appearance.performanceMode")}
          checked={settings.performanceMode}
          onChange={actions.setPerformanceMode}
        />
      </SettingsField>
    </>
  );
};
