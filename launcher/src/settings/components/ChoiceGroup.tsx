import type { MessageKey } from "../../shared/i18n/catalogues";
import { useTranslation } from "../../shared/i18n/useTranslation";

import { ChoiceOption } from "./ChoiceOption/ChoiceOption";
import { ControlGroup } from "./ControlGroup/ControlGroup";

interface Props<T extends string | boolean> {
  id: string;
  label: string;
  onSelect: (value: T) => void;
  options: ReadonlyArray<{ readonly value: T } & ({ readonly label: string } | { readonly labelKey: MessageKey })>;
  value: T;
}

export const ChoiceGroup = <T extends string | boolean>({ id, value, options, onSelect, label }: Props<T>) => {
  const { t } = useTranslation();
  return (
    <ControlGroup id={id} label={label}>
      {options.map((option) => (
        <ChoiceOption
          key={String(option.value)}
          id={id + ":" + option.value}
          selected={value === option.value}
          fill
          onSelect={() => onSelect(option.value)}
        >
          {"labelKey" in option ? t(option.labelKey) : option.label}
        </ChoiceOption>
      ))}
    </ControlGroup>
  );
};
