import type { MessageKey } from "../../shared/i18n/catalogues";
import { useTranslation } from "../../shared/i18n/useTranslation";

import { ChoiceOption } from "./ChoiceOption";
import { ControlGroup } from "./ControlGroup";

interface Props<T extends string | boolean> {
  grid?: boolean;
  id: string;
  label: string;
  onSelect: (value: T) => void;
  options: ReadonlyArray<{ readonly value: T } & ({ readonly label: string } | { readonly labelKey: MessageKey })>;
  value: T;
}

export const ChoiceGroup = <T extends string | boolean>({ id, value, options, onSelect, label, grid }: Props<T>) => {
  const { t } = useTranslation();
  return (
    <ControlGroup id={id} label={label} grid={grid}>
      {options.map((option) => (
        <ChoiceOption
          key={String(option.value)}
          id={id + ":" + option.value}
          selected={value === option.value}
          onSelect={() => onSelect(option.value)}
        >
          {"labelKey" in option ? t(option.labelKey) : option.label}
        </ChoiceOption>
      ))}
    </ControlGroup>
  );
};
