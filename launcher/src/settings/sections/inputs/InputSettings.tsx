import type { InputOption } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { ControlGroup } from "../../components/ControlGroup/ControlGroup";
import { SettingsSection } from "../../components/SettingsSection/SettingsSection";
import type { SettingsSectionProps } from "../../types";

import { InputName } from "./InputName/InputName";

const LIVE_TV_VISIBILITY_OPTIONS = [
  { value: true, labelKey: "common.show" },
  { value: false, labelKey: "common.hide" },
] as const;

const INPUT_VISIBILITY_OPTIONS = [
  { value: false, labelKey: "inputs.showAll" },
  { value: true, labelKey: "inputs.hideDisconnected" },
] as const;

interface Props extends SettingsSectionProps {
  inputs: readonly InputOption[];
}

export const InputSettings = ({ settings, actions, inputs }: Props) => {
  const { t } = useTranslation();
  return (
    <>
      <SettingsSection title={t("inputs.liveTv")} description={t("inputs.liveTvHint")}>
        <ChoiceGroup
          id="live-tv-visibility"
          label={t("inputs.liveTvVisibility")}
          value={settings.showLiveTv}
          options={LIVE_TV_VISIBILITY_OPTIONS}
          onSelect={actions.setLiveTvVisible}
        />
      </SettingsSection>
      <SettingsSection title={t("inputs.hdmi")} description={t("inputs.hdmiHint")}>
        <ChoiceGroup
          id="input-visibility"
          label={t("inputs.hdmiVisibility")}
          value={settings.hideDisconnectedHdmi}
          options={INPUT_VISIBILITY_OPTIONS}
          onSelect={actions.setHdmiVisibility}
        />
      </SettingsSection>
      <SettingsSection title={t("inputs.keepVisible")} description={t("inputs.keepHint")}>
        <div id="hdmi-keep-visible">
          {inputs
            .filter((input) => /^HDMI \d+$/.test(input.port))
            .map((input) => {
              const number = input.port.slice(5);
              return (
                <ChoiceGroup
                  key={input.port}
                  id={"hdmi-keep:" + number}
                  label={t("inputs.standbyVisibility", { port: input.port })}
                  value={settings.hdmiKeepVisible[number] === true}
                  options={[
                    { value: false, label: t("inputs.automatic", { port: input.port }) },
                    { value: true, label: t("inputs.alwaysShow", { port: input.port }) },
                  ]}
                  onSelect={(keep) => actions.setHdmiKeepVisible(number, keep)}
                />
              );
            })}
        </div>
      </SettingsSection>
      <SettingsSection title={t("inputs.names")}>
        <ControlGroup id="input-names">
          {inputs.map((input) => (
            <InputName key={input.port} {...input} name={settings.inputNames[input.port]} actions={actions} />
          ))}
        </ControlGroup>
      </SettingsSection>
    </>
  );
};
