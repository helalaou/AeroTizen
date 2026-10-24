import { RemoteControl } from '../../components/RemoteControl';

export const AddAppsTile = ({ onSelect }: { onSelect(): void }) => (
  <RemoteControl class="tile addapps" focusKey="add" role="button" onClick={onSelect}>
    <svg class="logo" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="#fff" stroke-width="1.6" />
      <path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
    </svg>
    <div class="name">Add apps<div class="sub">Samsung app store</div></div>
  </RemoteControl>
);
