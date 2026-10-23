import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

// Keep drafts local. A remote Done/Back blurs the field through the app key router.
export const useTextInput = (value: string, commit: (value: string) => void) => {
  const ref = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const [draft, setDraft] = useState(value);
  useLayoutEffect(() => { if (!editing.current) { setDraft(value); } }, [value]);
  return {
    ref, value: draft,
    focus: () => ref.current?.focus(),
    onFocus: () => { editing.current = true; },
    onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) => setDraft(event.currentTarget.value),
    onBlur: (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
      editing.current = false;
      const next = event.currentTarget.value.trim();
      setDraft(next); commit(next);
    }
  };
};
