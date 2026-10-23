import { useLayoutEffect, useRef } from 'preact/hooks';

// A local render can replace className (for example when artwork arrives).
// Restore the navigation-owned class before paint without changing focus/state.
export const useFocusClass = (current: () => HTMLElement | undefined, active: boolean) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active && ref.current && current() === ref.current) { ref.current.classList.add('focused'); }
  });
  return ref;
};
