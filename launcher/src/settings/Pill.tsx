import type { PillProps } from './types';

export const Pill = ({ id, selected = false, onSelect, children }: PillProps) => {
  return (
    <div class={'pill unit' + (selected ? ' on' : '')} data-key={id}
      role="button" aria-pressed={selected} onClick={onSelect}>
      {children}
    </div>
  );
};
