import { useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

// null means no edit is in progress: display the current saved value directly.
export const useTextInput = (value: string, commit: (value: string) => void) => {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  return {
    ref, value: draft ?? value,
    focus: () => ref.current?.focus(),
    onFocus: () => setDraft(previous => previous ?? value),
    onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) => setDraft(event.currentTarget.value),
    onBlur: (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
      const next = event.currentTarget.value.trim();
      setDraft(null);
      commit(next);
    }
  };
};
