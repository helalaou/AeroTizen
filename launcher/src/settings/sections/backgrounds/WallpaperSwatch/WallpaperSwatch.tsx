import { Pencil } from "lucide-preact";

import type { BackgroundOption } from "../../../../contracts/launcher";
import type { MessageKey } from "../../../../shared/i18n/catalogues";
import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { Icon } from "../../../../shared/icons/Icon/Icon";
import { SelectionIndicator } from "../../../components/SelectionIndicator/SelectionIndicator";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";

import styles from "./WallpaperSwatch.module.css";

interface Props {
  background: BackgroundOption;
  editable?: boolean;
  hidden: boolean;
  labelKey?: MessageKey;
  onSelect(): void;
  selected: boolean;
}

export const WallpaperSwatch = ({ background, editable = false, hidden, labelKey, onSelect, selected }: Props) => {
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
      <span class={styles.caption}>
        {editable ? (
          <span class={styles.editMark} data-wallpaper-edit aria-hidden="true">
            <Icon icon={Pencil} />
          </span>
        ) : null}
        <span class={styles.label} data-wallpaper-label>
          {t(labelKey ?? `scene.${background.id}`)}
        </span>
      </span>
      {selected ? <SelectionIndicator small /> : null}
    </SettingsControl>
  );
};
