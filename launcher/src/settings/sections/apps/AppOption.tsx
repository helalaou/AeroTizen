import { useMemo } from "preact/hooks";

import type { InstalledApp } from "../../../contracts/launcher";
import { AppFallback } from "../../../shared/components/AppFallback";
import { useImageSequence } from "../../../shared/hooks/useImageSequence";
import { SelectionIndicator } from "../../components/SelectionIndicator";
import { SettingsControl } from "../../components/SettingsControl";
import type { SettingsServices } from "../../types";

interface Props {
  active: boolean;
  app: InstalledApp;
  className?: string;
  describeApp: SettingsServices["describeApp"];
  disabled?: boolean;
  focusKey?: string;
  onSelect(): void;
  selected: boolean;
}

export const AppOption = ({
  app,
  selected,
  active,
  onSelect,
  describeApp,
  focusKey,
  className = "",
  disabled = false,
}: Props) => {
  const brand = useMemo(() => describeApp(app), [app, describeApp]);
  const artwork = useImageSequence(brand.artwork, active);
  return (
    <SettingsControl
      class={"tile app-tile " + className + (selected ? " on" : "") + (artwork.loaded ? " has-artwork" : "")}
      focusKey={focusKey || "app:" + app.id}
      role="button"
      aria-label={brand.title}
      title={brand.title}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) {
          onSelect();
        }
      }}
      style={{ "--app-background": artwork.loaded ? "transparent" : brand.background }}
    >
      <AppFallback app={app} brand={brand} active={active} hidden={artwork.loaded} />
      {artwork.src ? (
        <img
          key={artwork.src}
          class="app-artwork"
          alt=""
          src={artwork.src}
          hidden={!artwork.loaded}
          style={{ display: artwork.loaded ? undefined : "none" }}
          onLoad={artwork.onLoad}
          onError={artwork.onError}
        />
      ) : null}
      {selected ? <SelectionIndicator /> : null}
    </SettingsControl>
  );
};
