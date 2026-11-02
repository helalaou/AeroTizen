import { ChoiceOption } from "./ChoiceOption";

interface Props<T extends string | boolean> {
  id: string;
  label: string;
  onSelect: (value: T) => void;
  options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  value: T;
}

export const ChoiceGroup = <T extends string | boolean>({ id, value, options, onSelect, label }: Props<T>) => {
  return (
    <div id={id} class="units choice-group" role="group" aria-label={label}>
      {options.map(({ value: optionValue, label: optionLabel }) => (
        <ChoiceOption
          key={String(optionValue)}
          id={id + ":" + optionValue}
          selected={value === optionValue}
          onSelect={() => onSelect(optionValue)}
        >
          {optionLabel}
        </ChoiceOption>
      ))}
    </div>
  );
};
