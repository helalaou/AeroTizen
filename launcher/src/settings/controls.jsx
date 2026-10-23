import { h } from 'preact';

export function Pill({ id, selected = false, onSelect, children }) {
  return (
    <div class={'pill unit' + (selected ? ' on' : '')} data-key={id}
      role="button" aria-pressed={selected} onClick={onSelect}>
      {children}
    </div>
  );
}

export function Choice({ id, value, options, onSelect, label }) {
  return (
    <div id={id} class="units" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <Pill key={String(key)} id={id + ':' + key} selected={value === key}
          onSelect={() => onSelect(key)}>{text}</Pill>
      ))}
    </div>
  );
}
