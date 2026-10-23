import { h } from 'preact';
import { Pill } from './Pill.jsx';

export const Choice = ({ id, value, options, onSelect, label }) => {
  return (
    <div id={id} class="units" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <Pill key={String(key)} id={id + ':' + key} selected={value === key}
          onSelect={() => onSelect(key)}>{text}</Pill>
      ))}
    </div>
  );
};
