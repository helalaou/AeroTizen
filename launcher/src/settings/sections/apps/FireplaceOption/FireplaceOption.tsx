import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { FlameIcon } from "../../../../shared/icons/FlameIcon";
import { SelectionIndicator } from "../../../components/SelectionIndicator/SelectionIndicator";
import { SettingsAppCard } from "../SettingsAppCard/SettingsAppCard";

import styles from "./FireplaceOption.module.css";

export const FireplaceOption = ({ id, selected, onSelect }: { id: string; selected: boolean; onSelect(): void }) => {
  const { t } = useTranslation();
  return (
    <SettingsAppCard
      class={styles.fireplace}
      selected={selected}
      focusKey={"app:" + id}
      aria-label={t("common.fireplace")}
      onClick={onSelect}
    >
      <FlameIcon class={styles.icon} />
      <div class={styles.label}>{t("common.fireplace")}</div>
      {selected ? <SelectionIndicator /> : null}
    </SettingsAppCard>
  );
};
