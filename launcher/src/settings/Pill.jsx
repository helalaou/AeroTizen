import { h } from 'preact';

export const Pill = ({ id, selected = false, onSelect, children }) => {
  return (
    <div class={'pill unit' + (selected ? ' on' : '')} data-key={id}
      role="button" aria-pressed={selected} onClick={onSelect}>
      {children}
    </div>
  );
};
