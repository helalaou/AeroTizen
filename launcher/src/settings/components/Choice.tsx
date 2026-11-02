import { Pill } from "./Pill";

interface Props<T extends string | boolean> {
  id: string;
  label: string;
  onSelect: (value: T) => void;
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
}

export const Choice = <T extends string | boolean>({ id, value, options, onSelect, label }: Props<T>) => {
  return (
    <div id={id} class="units" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <Pill key={String(key)} id={id + ":" + key} selected={value === key} onSelect={() => onSelect(key)}>
          {text}
        </Pill>
      ))}
    </div>
  );
};
