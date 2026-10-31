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
    <h3>Keep HDMI ports visible</h3>
    <p class="hint">Recognised standby devices stay visible automatically. Use an override only for an unidentified device.</p>
    <div id="hdmi-keep-visible">
      {inputs.filter(input => /^HDMI \d+$/.test(input.port)).map(input => {
        const number = input.port.slice(5);
        return <Choice key={input.port} id={'hdmi-keep:' + number} label={input.port + ' standby visibility'}
          value={settings.hdmiKeepVisible[number] === true} options={[[false, input.port + ': Automatic'], [true, input.port + ': Always show']]}
          onSelect={keep => actions.setHdmiKeepVisible(number, keep)} />;
      })}
    </div>
    <h3>Input names</h3>
    <div id="input-names" class="units">
      {inputs.map(input => <InputName key={input.port} {...input} name={settings.inputNames[input.port]} actions={actions} />)}
    </div>
  </>
);
