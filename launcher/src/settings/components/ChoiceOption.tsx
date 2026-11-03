import type { ComponentChildren } from "preact";

import { SettingsControl } from "./SettingsControl";

interface Props {
  children: ComponentChildren;
  id: string;
  onSelect(): void;
  selected?: boolean;
}

export const ChoiceOption = ({ id, selected = false, onSelect, children }: Props) => {
  return (
    <SettingsControl
      class={"pill unit choice-option" + (selected ? " on" : "")}
      focusKey={id}
      role="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      {children}
    </SettingsControl>
  );
};
