import { useTranslation } from '../../shared/hooks/useTranslation';
import { Pill } from './Pill';

interface Props<T extends string | boolean> {
  id: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onSelect: (value: T) => void;
  label: string;
}

export const Choice = <T extends string | boolean,>({ id, value, options, onSelect, label }: Props<T>) => {
  const translate = useTranslation();
  return (
    <div id={id} class="units" role="group" aria-label={translate(label)}>
      {options.map(([key, text]) => (
        <Pill key={String(key)} id={id + ':' + key} selected={value === key}
          onSelect={() => onSelect(key)}>{text}</Pill>
      ))}
    </div>
  );
};
