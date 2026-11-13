import { AppCard } from "../../../../shared/components/AppCard/AppCard";
import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { FlameIcon } from "../../../../shared/icons/FlameIcon";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";

import styles from "./FireplaceOption.module.css";

export const FireplaceOption = ({ id, selected, onSelect }: { id: string; selected: boolean; onSelect(): void }) => {
  const { t } = useTranslation();
  return (
    <AppCard
      variant="favourite"
      selected={selected}
      renderControl={({ className, children }) => (
        <SettingsControl
          class={className + " " + styles.fireplace}
          role="button"
          aria-pressed={selected}
          data-settings-card="favourite"
          focusKey={"app:" + id}
          aria-label={t("common.fireplace")}
          onClick={onSelect}
        >
          {children}
        </SettingsControl>
      )}
    >
      <FlameIcon class={styles.icon} />
      <div class={styles.label}>{t("common.fireplace")}</div>
    </AppCard>
  );
};
