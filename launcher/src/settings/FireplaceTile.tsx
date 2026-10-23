import { FlameIcon } from './FlameIcon';

export const FireplaceTile = ({ id, selected, onSelect }: { id: string; selected: boolean; onSelect(): void }) => (
  <div class={'tile fire' + (selected ? ' on' : '')} data-key={'app:' + id} role="button"
    aria-label="Fireplace" aria-pressed={selected} onClick={onSelect}>
    <FlameIcon /><div class="name">Fireplace</div>
  </div>
);
