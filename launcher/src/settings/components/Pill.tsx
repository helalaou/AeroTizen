import type { ComponentChildren } from "preact";

import { RemoteControl } from "./RemoteControl";

interface PillProps {
  children: ComponentChildren;
  id: string;
  onSelect(): void;
  selected?: boolean;
}

export const Pill = ({ id, selected = false, onSelect, children }: PillProps) => {
  return (
    <RemoteControl
      class={"pill unit" + (selected ? " on" : "")}
      focusKey={id}
      role="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      {children}
    </RemoteControl>
  );
};
