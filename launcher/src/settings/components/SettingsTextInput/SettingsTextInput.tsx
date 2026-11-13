import { useRef } from "preact/hooks";

import { SettingsControl } from "../SettingsControl/SettingsControl";

import styles from "./SettingsTextInput.module.css";
import type { TextInputValue } from "./useTextInputDraft";
import { useTextInputDraft } from "./useTextInputDraft";
import { useTextInputScope } from "./useTextInputScope";

interface Props extends TextInputValue {
  active?: boolean;
  autoFocus?: boolean;
  enterKeyHint?: "done" | "search";
  focusKey: string;
  label: string;
  maxLength: number;
  name?: string;
  onSubmit?(): void;
  placeholder?: string;
  prefix?: string;
}

export const SettingsTextInput = ({
  active = true,
  autoFocus = false,
  enterKeyHint = "done",
  focusKey,
  label,
  maxLength,
  name,
  onCommit,
  onSubmit,
  onValueChange,
  placeholder,
  prefix,
  value,
}: Props) => {
  const input = useRef<HTMLInputElement>(null);
  const draft = useTextInputDraft({ value, onCommit, onValueChange });
  useTextInputScope({ active, autoFocus, input, onSubmit });
  return (
    <SettingsControl class={styles.control} focusKey={focusKey} onClick={() => input.current?.focus()}>
      {prefix ? <span class={styles.prefix}>{prefix}</span> : null}
      <input
        {...draft}
        ref={input}
        class={styles.field}
        type="text"
        name={name}
        autoComplete="off"
        enterKeyHint={enterKeyHint}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
      />
    </SettingsControl>
  );
};
