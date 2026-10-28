import { Choice } from '../../components/Choice';
import { InputName } from './InputName';
import type { InputOption, SettingsSectionProps } from '../../types';

interface Props extends SettingsSectionProps { inputs: readonly InputOption[] }

export const InputSettings = ({ settings, actions, inputs }: Props) => (
  <>
    <h3>HDMI ports</h3>
    <p class="hint">Choose whether to show HDMI ports that the TV reports as disconnected.</p>
    <Choice id="input-visibility" label="HDMI visibility" value={settings.hideDisconnectedHdmi}
      options={[[false, 'Show all'], [true, 'Hide disconnected']]} onSelect={actions.setHdmiVisibility} />
    <h3>Input names</h3>
    <div id="input-names" class="units">
      {inputs.map(input => <InputName key={input.port} {...input} name={settings.inputNames[input.port]} actions={actions} />)}
    </div>
  </>
);
