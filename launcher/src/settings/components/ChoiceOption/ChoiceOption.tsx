import type { ComponentChildren } from "preact";

import text from "../../../shared/styles/text.module.css";
import { SettingsControl } from "../SettingsControl/SettingsControl";

import styles from "./ChoiceOption.module.css";

interface Props {
  align?: "center" | "start";
  busy?: boolean;
  children: ComponentChildren;
  controls?: string;
  disabled?: boolean;
  expanded?: boolean;
  id: string;
  inline?: boolean;
  onSelect(): void;
  selected?: boolean;
  truncate?: boolean;
}

export const ChoiceOption = ({
  id,
  selected = false,
  onSelect,
  children,
  inline = false,
  truncate = false,
  busy,
  controls,
  disabled,
  expanded,
  align = "center",
}: Props) => {
  return (
    <SettingsControl
      class={styles.option}
      focusKey={id}
      role="button"
      data-align={align}
      aria-pressed={selected}
      aria-busy={busy}
      aria-controls={controls}
      aria-disabled={disabled}
      aria-expanded={expanded}
      onClick={() => {
        if (!disabled) {
          onSelect();
        }
      }}
    >
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
