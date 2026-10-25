import { AddIcon } from '../../../shared/icons/AddIcon';
import { RemoteControl } from '../../components/RemoteControl';

export const AddAppsTile = ({ onSelect }: { onSelect(): void }) => (
  <RemoteControl class="tile addapps" focusKey="add" role="button" onClick={onSelect}>
    <AddIcon />
    <div class="name">Add apps<div class="sub">Samsung app store</div></div>
  </RemoteControl>
);
