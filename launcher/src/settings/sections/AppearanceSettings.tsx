import { ChoiceGroup } from "../components/ChoiceGroup";
import type { SettingsSectionProps } from "../types";

const APPEARANCE_OPTIONS = [
  { value: false, label: "Classic" },
  { value: true, label: "Glass" },
] as const;

const NETWORK_VISIBILITY_OPTIONS = [
  { value: true, label: "Show" },
  { value: false, label: "Hide" },
] as const;

const HOME_CARD_MODE_OPTIONS = [
  { value: "square", label: "Square" },
  { value: "rectangle", label: "Rectangle" },
] as const;

const HOME_CARD_COLUMNS_OPTIONS = [
  { value: "auto", label: "Follow card size" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
] as const;

const CARD_SIZE_OPTIONS = [
  { value: "big", label: "Big" },
  { value: "small", label: "Small" },
] as const;

export const AppearanceSettings = ({ settings, actions }: SettingsSectionProps) => (
  <>
    <h3>Interface appearance</h3>
    <ChoiceGroup
      id="settings-appearance"
      label="Interface appearance"
      value={settings.glassSettings === true}
      options={APPEARANCE_OPTIONS}
      onSelect={actions.setGlassSettings}
    />
    <h3>Network indicator</h3>
    <ChoiceGroup
      id="network-visibility"
      label="Network indicator visibility"
      value={settings.showNetwork !== false}
      options={NETWORK_VISIBILITY_OPTIONS}
      onSelect={actions.setNetworkVisible}
    />

    <h3>App cards</h3>
    <ChoiceGroup
      id="home-card-mode"
      label="Home tile layout"
      value={settings.homeCardMode}
      options={HOME_CARD_MODE_OPTIONS}
      onSelect={actions.setHomeCardMode}
    />
    <ChoiceGroup
      id="home-card-columns"
      label="Apps per row"
      value={String(settings.homeCardColumns || "auto")}
      options={HOME_CARD_COLUMNS_OPTIONS}
      onSelect={(value) => actions.setHomeCardColumns(value === "auto" ? null : Number(value))}
    />
    {!settings.homeCardColumns ? (
      <ChoiceGroup
        id="card-sizes"
        label="App card size"
        value={settings.cardSize || "big"}
        options={CARD_SIZE_OPTIONS}
        onSelect={actions.setCardSize}
      />
    ) : null}
  </>
);
