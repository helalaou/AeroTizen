import type { JSX } from "preact";
import { useState } from "preact/hooks";

export interface TextInputValue {
  onCommit?(value: string): void;
  onValueChange?(value: string): void;
  value: string;
}

// Keep edits stable while external settings update. After blur, show the saved value.
export const useTextInputDraft = ({ value, onCommit, onValueChange }: TextInputValue) => {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? value,
    onFocus: () => setDraft((previous) => previous ?? value),
    onInput(event: JSX.TargetedEvent<HTMLInputElement, Event>) {
      const next = event.currentTarget.value;
      setDraft(next);
      onValueChange?.(next);
    },
    onBlur(event: JSX.TargetedFocusEvent<HTMLInputElement>) {
      const next = event.currentTarget.value.trim();
      setDraft(null);
      onCommit?.(next);
    },
  };
};
