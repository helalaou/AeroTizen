import type { BackgroundOption } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SelectionIndicator } from "../../components/SelectionIndicator";
import { SettingsControl } from "../../components/SettingsControl";

import styles from "./WallpaperSwatch.module.css";

interface Props {
  background: BackgroundOption;
  hidden: boolean;
  onSelect(): void;
  selected: boolean;
}

export const WallpaperSwatch = ({ background, hidden, onSelect, selected }: Props) => {
  const { t } = useTranslation();
  return (
    <SettingsControl
      class={styles.swatch}
      data-wallpaper-swatch
      hidden={hidden}
      focusKey={"bg:" + background.id}
      role="button"
      aria-pressed={selected}
      style={{ background: background.preview }}
      onClick={onSelect}
    >
      <span class={styles.label}>{t(`scene.${background.id}`)}</span>
      {selected ? <SelectionIndicator small /> : null}
    </SettingsControl>
  );
};
