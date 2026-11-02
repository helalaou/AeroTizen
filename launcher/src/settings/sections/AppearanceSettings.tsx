import { ChoiceGroup } from "../components/ChoiceGroup";
import type { SettingsSectionProps } from "../types";
export const AppearanceSettings = ({ settings, actions }: SettingsSectionProps) => (
  <>
    <h3>Interface appearance</h3>
    <ChoiceGroup
      id="settings-appearance"
      label="Interface appearance"
      value={settings.glassSettings === true}
      options={[
        [false, "Classic"],
        [true, "Glass"],
      ]}
      onSelect={actions.setGlassSettings}
    />
    <h3>Network indicator</h3>
    <ChoiceGroup
      id="network-visibility"
      label="Network indicator visibility"
      value={settings.showNetwork !== false}
      options={[
        [true, "Show"],
        [false, "Hide"],
      ]}
      onSelect={actions.setNetworkVisible}
    />

    <h3>App cards</h3>
    <ChoiceGroup
      id="home-card-mode"
      label="Home tile layout"
      value={settings.homeCardMode}
      options={[
        ["square", "Square"],
        ["rectangle", "Rectangle"],
      ]}
      onSelect={actions.setHomeCardMode}
    />
    <ChoiceGroup
      id="home-card-columns"
      label="Apps per row"
      value={String(settings.homeCardColumns || "auto")}
      options={[
        ["auto", "Follow card size"],
        ["3", "3"],
        ["4", "4"],
        ["5", "5"],
      ]}
      onSelect={(value) => actions.setHomeCardColumns(value === "auto" ? null : Number(value))}
    />
    {!settings.homeCardColumns ? (
      <ChoiceGroup
        id="card-sizes"
        label="App card size"
        value={settings.cardSize || "big"}
        options={[
          ["big", "Big"],
          ["small", "Small"],
        ]}
        onSelect={actions.setCardSize}
      />
    ) : null}
  </>
);
