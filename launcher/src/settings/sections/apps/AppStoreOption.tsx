import { CirclePlus } from "lucide-preact";

import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon";
import { SettingsControl } from "../../components/SettingsControl";

export const AppStoreOption = ({ onSelect }: { onSelect(): void }) => {
  const { t } = useTranslation();
  return (
    <SettingsControl class="tile addapps" focusKey="add" role="button" onClick={onSelect}>
      <Icon icon={CirclePlus} class="logo" />
      <div class="name">
        {t("apps.add")}
        <div class="sub">{t("apps.store")}</div>
      </div>
    </SettingsControl>
  );
};
