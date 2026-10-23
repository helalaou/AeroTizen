import { h, Fragment } from 'preact';
import { Choice } from './Choice.jsx';
import { InputName } from './InputName.jsx';

export const InputSettings = ({ settings, actions, sources, portName }) => {
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
};
