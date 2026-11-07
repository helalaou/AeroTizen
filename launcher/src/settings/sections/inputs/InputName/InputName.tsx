import { useTextInput } from "../../../../shared/hooks/useTextInput";
import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";
import type { SettingsActions } from "../../../types";

import styles from "./InputName.module.css";

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
    <SettingsControl class={styles.control} focusKey={"name:" + port} onClick={focus}>
      <span class={styles.port}>{port}</span>
      <input
        {...input}
        class={styles.field}
        type="text"
        maxLength={24}
        placeholder={placeholder || t("inputs.addName")}
        aria-label={t("inputs.nameLabel", { port })}
      />
    </SettingsControl>
  );
};
