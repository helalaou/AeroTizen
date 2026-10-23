import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { Choice } from './controls.jsx';

function InputName({ port, name, placeholder, actions }) {
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
}

export function InputSettings({ settings, actions, sources, portName }) {
  return (
    <>
      <h3>HDMI ports</h3>
      <p class="hint">Choose whether to show HDMI ports that the TV reports as disconnected.</p>
      <Choice id="input-visibility" label="HDMI visibility" value={settings.hideDisconnectedHdmi}
        options={[[false, 'Show all'], [true, 'Hide disconnected']]} onSelect={actions.setHdmiVisibility} />
      <h3>Input names</h3>
      <div id="input-names" class="units">
        {sources.filter(source => source.type !== 'TV').map(source => {
          const port = portName(source);
          return <InputName key={port} port={port} name={settings.inputNames[port]}
            placeholder={source.editName} actions={actions} />;
        })}
      </div>
    </>
  );
}
