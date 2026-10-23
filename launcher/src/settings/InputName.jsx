import { h } from 'preact';
import { useState } from 'preact/hooks';

export const InputName = ({ port, name, placeholder, actions }) => {
  const [draft, setDraft] = useState(name || '');
  function save(event) {
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
