import type { ComponentChildren } from 'preact';
import { RemoteControl } from './RemoteControl';

interface PillProps { id: string; selected?: boolean; onSelect(): void; children: ComponentChildren }

export const Pill = ({ id, selected = false, onSelect, children }: PillProps) => {
  return (
    <RemoteControl class={'pill unit' + (selected ? ' on' : '')} focusKey={id}
      role="button" aria-pressed={selected} onClick={onSelect}>
      {children}
    </RemoteControl>
  );
};
