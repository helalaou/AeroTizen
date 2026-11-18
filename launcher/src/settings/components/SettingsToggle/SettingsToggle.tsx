import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsControl } from "../SettingsControl/SettingsControl";

import styles from "./SettingsToggle.module.css";

interface Props {
  checked: boolean;
  disabled?: boolean;
  focusKey: string;
  label: string;
  onChange(checked: boolean): void;
}

export const SettingsToggle = ({ checked, disabled, focusKey, label, onChange }: Props) => {
  const { t } = useTranslation();
  return (
    <SettingsControl
      class={styles.control}
      focusKey={focusKey}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={label}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
    >
      <span class={styles.state} aria-hidden="true">
        <span>{t(checked ? "common.on" : "common.off")}</span>
        <span class={styles.track} data-settings-toggle-part="track">
          <span class={styles.thumb} data-settings-toggle-part="thumb" />
        </span>
      </span>
    </SettingsControl>
  );
};
