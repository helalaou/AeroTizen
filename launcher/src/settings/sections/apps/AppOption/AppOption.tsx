import { useMemo } from "preact/hooks";

import type { InstalledApp } from "../../../../contracts/launcher";
import type { AppCardVariant } from "../../../../shared/components/AppCard/AppCard";
import { AppCard } from "../../../../shared/components/AppCard/AppCard";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";
import type { SettingsServices } from "../../../types";

interface Props {
  active: boolean;
  app: InstalledApp;
  describeApp: SettingsServices["describeApp"];
  disabled?: boolean;
  focusKey?: string;
  onSelect(): void;
  selected: boolean;
  variant?: Exclude<AppCardVariant, "home">;
}

export const AppOption = ({
  app,
  selected,
  active,
  onSelect,
  describeApp,
  focusKey,
  variant = "favourite",
  disabled = false,
}: Props) => {
  const presentation = useMemo(() => describeApp(app), [app, describeApp]);
  return (
    <AppCard
      presentation={presentation}
      active={active}
      selected={selected}
      variant={variant}
      renderControl={({ className, children, artworkLoaded }) => (
        <SettingsControl
          class={className}
          role="button"
          aria-pressed={selected}
          data-settings-card={variant}
          data-app-option
          data-artwork-loaded={artworkLoaded ? "true" : undefined}
          focusKey={focusKey || "app:" + app.id}
          aria-label={presentation.title}
          title={presentation.title}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) {
              onSelect();
            }
          }}
        >
          {children}
        </SettingsControl>
      )}
    />
  );
};
