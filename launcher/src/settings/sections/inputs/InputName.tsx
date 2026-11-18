import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsField } from "../../components/SettingsField/SettingsField";
import { SettingsTextInput } from "../../components/SettingsTextInput/SettingsTextInput";
import type { SettingsActions } from "../../types";

const INPUT_NAME_MAX_LENGTH = 24;

interface Props {
  actions: SettingsActions;
  name?: string;
  placeholder?: string;
  port: string;
}

export const InputName = ({ port, name, placeholder, actions }: Props) => {
  const { t } = useTranslation();
  return (
    <SettingsField title={port}>
      <SettingsTextInput
        focusKey={"name:" + port}
        value={name || ""}
        maxLength={INPUT_NAME_MAX_LENGTH}
        placeholder={placeholder || t("inputs.addName")}
        label={t("inputs.nameLabel", { port })}
        onCommit={(value) => actions.saveInputName(port, value)}
      />
    </SettingsField>
  );
};
