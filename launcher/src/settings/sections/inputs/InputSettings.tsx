import type { InputOption } from "../../../contracts/launcher";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import type { SettingsSectionProps } from "../../types";

import { InputName } from "./InputName";

const LIVE_TV_VISIBILITY_OPTIONS = [
  { value: true, label: "Show" },
  { value: false, label: "Hide" },
] as const;

const INPUT_VISIBILITY_OPTIONS = [
  { value: false, label: "Show all" },
  { value: true, label: "Hide disconnected" },
] as const;

interface Props extends SettingsSectionProps {
  inputs: readonly InputOption[];
}

export const InputSettings = ({ settings, actions, inputs }: Props) => (
  <>
    <h3>Live TV</h3>
    <p class="hint">Show the Live TV tile in Inputs.</p>
    <ChoiceGroup
      id="live-tv-visibility"
      label="Live TV visibility"
      value={settings.showLiveTv}
      options={LIVE_TV_VISIBILITY_OPTIONS}
      onSelect={actions.setLiveTvVisible}
    />
    <h3>HDMI ports</h3>
    <p class="hint">Choose whether to show HDMI ports that the TV reports as disconnected.</p>
    <ChoiceGroup
      id="input-visibility"
      label="HDMI visibility"
      value={settings.hideDisconnectedHdmi}
      options={INPUT_VISIBILITY_OPTIONS}
      onSelect={actions.setHdmiVisibility}
    />
    <h3>Keep HDMI ports visible</h3>
    <p class="hint">
      Recognised standby devices stay visible automatically. Use an override only for an unidentified device.
    </p>
    <div id="hdmi-keep-visible">
      {inputs
        .filter((input) => /^HDMI \d+$/.test(input.port))
        .map((input) => {
          const number = input.port.slice(5);
          return (
            <ChoiceGroup
              key={input.port}
              id={"hdmi-keep:" + number}
              label={input.port + " standby visibility"}
              value={settings.hdmiKeepVisible[number] === true}
              options={[
                { value: false, label: input.port + ": Automatic" },
                { value: true, label: input.port + ": Always show" },
              ]}
              onSelect={(keep) => actions.setHdmiKeepVisible(number, keep)}
            />
          );
        })}
    </div>
    <h3>Input names</h3>
    <div id="input-names" class="units">
      {inputs.map((input) => (
        <InputName key={input.port} {...input} name={settings.inputNames[input.port]} actions={actions} />
      ))}
    </div>
  </>
);
