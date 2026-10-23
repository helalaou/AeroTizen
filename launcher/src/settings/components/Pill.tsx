import type { ComponentChildren } from 'preact';

interface PillProps { id: string; selected?: boolean; onSelect(): void; children: ComponentChildren }

export const Pill = ({ id, selected = false, onSelect, children }: PillProps) => {
  return (
    <div class={'pill unit' + (selected ? ' on' : '')} data-key={id}
      role="button" aria-pressed={selected} onClick={onSelect}>
      {children}
    </div>
  );
};
