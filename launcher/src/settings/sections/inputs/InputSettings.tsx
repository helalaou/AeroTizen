import type { InputOption } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsField } from "../../components/SettingsField/SettingsField";
import { SettingsSection } from "../../components/SettingsSection/SettingsSection";
import { SettingsToggle } from "../../components/SettingsToggle/SettingsToggle";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";
import type { SettingsSectionProps } from "../../types";

import { InputName } from "./InputName";
import { IpControlProbe } from "./IpControlProbe";

interface Props extends SettingsSectionProps {
  inputs: readonly InputOption[];
}

export const InputSettings = ({ settings, actions, inputs }: Props) => {
  const { t } = useTranslation();
  const { services } = useSettingsEnvironment();
  return (
    <>
      <SettingsField title={t("inputs.liveTv")} description={t("inputs.liveTvHint")}>
        <SettingsToggle
          focusKey="live-tv-visibility"
          label={t("inputs.liveTvVisibility")}
          checked={settings.showLiveTv}
          onChange={actions.setLiveTvVisible}
        />
      </SettingsField>
      <SettingsField title={t("inputs.hideDisconnected")} description={t("inputs.hdmiHint")}>
        <SettingsToggle
          focusKey="input-visibility"
          label={t("inputs.hideDisconnected")}
          checked={settings.hideDisconnectedHdmi}
          onChange={actions.setHdmiVisibility}
        />
      </SettingsField>
      <SettingsSection
        title={t("inputs.keepVisible")}
        description={t("inputs.keepHint")}
        hidden={!settings.hideDisconnectedHdmi}
      >
        <div id="hdmi-keep-visible">
          {inputs
            .filter((input) => /^HDMI \d+$/.test(input.port))
            .map((input) => {
              const number = input.port.slice(5);
              return (
                <SettingsField key={input.port} title={t("inputs.alwaysShow", { port: input.port })}>
                  <SettingsToggle
                    focusKey={"hdmi-keep:" + number}
                    label={t("inputs.alwaysShow", { port: input.port })}
                    checked={settings.hdmiKeepVisible[number] === true}
                    onChange={(keep) => actions.setHdmiKeepVisible(number, keep)}
                  />
                </SettingsField>
              );
            })}
        </div>
      </SettingsSection>
      <SettingsSection title={t("inputs.names")}>
        <div id="input-names">
          {inputs.map((input) => (
            <InputName key={input.port} {...input} name={settings.inputNames[input.port]} actions={actions} />
          ))}
        </div>
      </SettingsSection>
      {services.canLearnIpControlInput() && <IpControlProbe />}
    </>
  );
};
