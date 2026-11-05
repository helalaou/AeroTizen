import { useTextInput } from "../../../shared/hooks/useTextInput";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsControl } from "../../components/SettingsControl";
import type { SettingsActions } from "../../types";

interface Props {
  actions: SettingsActions;
  name?: string;
  placeholder?: string;
  port: string;
}

export const InputName = ({ port, name, placeholder, actions }: Props) => {
  const { t } = useTranslation();
  const { focus, ...input } = useTextInput(name || "", (value) => actions.saveInputName(port, value));
  return (
    <SettingsControl class="pill unit name-pill" focusKey={"name:" + port} onClick={focus}>
      <span class="port">{port}</span>
      <input
        {...input}
        type="text"
        maxLength={24}
        placeholder={placeholder || t("inputs.addName")}
        aria-label={t("inputs.nameLabel", { port })}
      />
    </SettingsControl>
  );
};
