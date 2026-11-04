import { useTranslation } from "../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { SettingsSection } from "../components/SettingsSection";
import type { SettingsSectionProps } from "../types";

const APPEARANCE_OPTIONS = [
  { value: false, labelKey: "appearance.classic" },
  { value: true, labelKey: "appearance.glass" },
] as const;

const HOME_CARD_MODE_OPTIONS = [
  { value: "square", labelKey: "appearance.square" },
  { value: "rectangle", labelKey: "appearance.rectangle" },
] as const;

const HOME_CARD_COLUMNS_OPTIONS = [
  { value: "auto", labelKey: "appearance.followSize" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
] as const;

const CARD_SIZE_OPTIONS = [
  { value: "big", labelKey: "appearance.big" },
  { value: "small", labelKey: "appearance.small" },
] as const;

export const AppearanceSettings = ({ settings, actions }: SettingsSectionProps) => {
  const { t } = useTranslation();
  return (
    <>
      <SettingsSection title={t("appearance.title")}>
        <ChoiceGroup
          id="settings-appearance"
          label={t("appearance.title")}
          value={settings.glassSettings === true}
          options={APPEARANCE_OPTIONS}
          onSelect={actions.setGlassSettings}
        />
      </SettingsSection>
      <SettingsSection title={t("appearance.cards")}>
        <ChoiceGroup
          id="home-card-mode"
          label={t("appearance.tileLayout")}
          value={settings.homeCardMode}
          options={HOME_CARD_MODE_OPTIONS}
          onSelect={actions.setHomeCardMode}
        />
        <ChoiceGroup
          id="home-card-columns"
          label={t("appearance.columns")}
          value={String(settings.homeCardColumns || "auto")}
          options={HOME_CARD_COLUMNS_OPTIONS}
          onSelect={(value) => actions.setHomeCardColumns(value === "auto" ? null : Number(value))}
        />
        {!settings.homeCardColumns ? (
          <ChoiceGroup
            id="card-sizes"
            label={t("appearance.cardSize")}
            value={settings.cardSize || "big"}
            options={CARD_SIZE_OPTIONS}
            onSelect={actions.setCardSize}
          />
        ) : null}
      </SettingsSection>
    </>
  );
};
