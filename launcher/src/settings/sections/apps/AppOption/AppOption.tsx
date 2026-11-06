import { useMemo } from "preact/hooks";

import type { InstalledApp } from "../../../../contracts/launcher";
import { AppFallback } from "../../../../shared/components/AppFallback/AppFallback";
import { useImageSequence } from "../../../../shared/hooks/useImageSequence";
import { SelectionIndicator } from "../../../components/SelectionIndicator/SelectionIndicator";
import type { SettingsServices } from "../../../types";
import type { SettingsAppVariant } from "../SettingsAppCard/SettingsAppCard";
import { SettingsAppCard } from "../SettingsAppCard/SettingsAppCard";

import styles from "./AppOption.module.css";

interface Props {
  active: boolean;
  app: InstalledApp;
  describeApp: SettingsServices["describeApp"];
  disabled?: boolean;
  focusKey?: string;
  onSelect(): void;
  selected: boolean;
  variant?: SettingsAppVariant;
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
  const brand = useMemo(() => describeApp(app), [app, describeApp]);
  const artwork = useImageSequence(brand.artwork, active);
  return (
    <SettingsAppCard
      selected={selected}
      variant={variant}
      data-app-option
      data-artwork-loaded={artwork.loaded ? "true" : undefined}
      focusKey={focusKey || "app:" + app.id}
      aria-label={brand.title}
      title={brand.title}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) {
          onSelect();
        }
      }}
      style={{ "--app-background": artwork.loaded ? "transparent" : brand.background }}
    >
      <AppFallback app={app} brand={brand} active={active} hidden={artwork.loaded} variant={variant} />
      {artwork.src ? (
        <img
          key={artwork.src}
          class={styles.artwork}
          data-app-artwork
          alt=""
          src={artwork.src}
          hidden={!artwork.loaded}
          style={{ display: artwork.loaded ? undefined : "none" }}
          onLoad={artwork.onLoad}
          onError={artwork.onError}
        />
      ) : null}
      {selected ? <SelectionIndicator /> : null}
    </SettingsAppCard>
  );
};
