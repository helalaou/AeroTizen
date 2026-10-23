import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { SettingsActions } from './types';

interface Props {
  port: string;
  name?: string;
  placeholder?: string;
  actions: SettingsActions;
}

export const InputName = ({ port, name, placeholder, actions }: Props) => {
  const [draft, setDraft] = useState(name || '');
  function save(event: JSX.TargetedEvent<HTMLInputElement, Event>) {
    const value = event.currentTarget.value.trim();
    setDraft(value);
    actions.saveInputName(port, value);
  }
  return (
    <div class="pill unit name-pill" data-key={'name:' + port}
      onClick={event => actions.editInput('name:' + port, event.currentTarget)}>
      <span class="port">{port}</span>
      <input type="text" maxLength={24} value={draft} placeholder={placeholder || 'Add a name'}
        aria-label={port + ' name'} onInput={event => setDraft(event.currentTarget.value)}
        onChange={save} onBlur={save} />
    </div>
  );
};
