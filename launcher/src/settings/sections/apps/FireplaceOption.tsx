import { useTranslation } from "../../../shared/i18n/useTranslation";
import { FlameIcon } from "../../../shared/icons/FlameIcon";
import { SelectionIndicator } from "../../components/SelectionIndicator";
import { SettingsControl } from "../../components/SettingsControl";

export const FireplaceOption = ({ id, selected, onSelect }: { id: string; selected: boolean; onSelect(): void }) => {
  const { t } = useTranslation();
  return (
    <SettingsControl
      class={"tile fire" + (selected ? " on" : "")}
      focusKey={"app:" + id}
      role="button"
      aria-label={t("common.fireplace")}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <FlameIcon />
      <div class="name">{t("common.fireplace")}</div>
      {selected ? <SelectionIndicator /> : null}
    </SettingsControl>
  );
};
