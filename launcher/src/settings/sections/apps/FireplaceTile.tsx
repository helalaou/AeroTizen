import { RemoteControl } from '../../components/RemoteControl';
import { FlameIcon } from './FlameIcon';

export const FireplaceTile = ({ id, selected, onSelect }: { id: string; selected: boolean; onSelect(): void }) => (
  <RemoteControl class={'tile fire' + (selected ? ' on' : '')} focusKey={'app:' + id} role="button"
    aria-label="Fireplace" aria-pressed={selected} onClick={onSelect}>
    <FlameIcon /><div class="name">Fireplace</div>
  </RemoteControl>
);
