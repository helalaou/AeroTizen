import type { ComponentChildren } from "preact";

import text from "../../shared/styles/text.module.css";

import styles from "./ChoiceOption.module.css";
import { SettingsControl } from "./SettingsControl";

interface Props {
  children: ComponentChildren;
  id: string;
  inline?: boolean;
  onSelect(): void;
  selected?: boolean;
  truncate?: boolean;
}

export const ChoiceOption = ({ id, selected = false, onSelect, children, inline = false, truncate = false }: Props) => {
  return (
    <SettingsControl class={styles.option} focusKey={id} role="button" aria-pressed={selected} onClick={onSelect}>
      <span
        class={
          styles.label +
          (inline ? " " + styles.inline : "") +
          (truncate ? " " + styles.singleLine + " " + text.truncate : "")
        }
      >
        {children}
      </span>
    </SettingsControl>
  );
};
