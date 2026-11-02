import { useTextInput } from "../../../shared/hooks/useTextInput";
import { SettingsControl } from "../../components/SettingsControl";
import type { SettingsActions } from "../../types";

interface Props {
  actions: SettingsActions;
  name?: string;
  placeholder?: string;
  port: string;
}

export const InputName = ({ port, name, placeholder, actions }: Props) => {
  const { focus, ...input } = useTextInput(name || "", (value) => actions.saveInputName(port, value));
  return (
    <SettingsControl class="pill unit name-pill" focusKey={"name:" + port} onClick={focus}>
      <span class="port">{port}</span>
      <input
        {...input}
        type="text"
        maxLength={24}
        placeholder={placeholder || "Add a name"}
        aria-label={port + " name"}
      />
    </SettingsControl>
  );
};
