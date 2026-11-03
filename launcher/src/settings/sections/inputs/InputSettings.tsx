import type { InputOption } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import type { SettingsSectionProps } from "../../types";

import { InputName } from "./InputName";

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
      <h3>{t("inputs.liveTv")}</h3>
      <p class="hint">{t("inputs.liveTvHint")}</p>
      <ChoiceGroup
        id="live-tv-visibility"
        label={t("inputs.liveTvVisibility")}
        value={settings.showLiveTv}
        options={LIVE_TV_VISIBILITY_OPTIONS}
        onSelect={actions.setLiveTvVisible}
      />
      <h3>{t("inputs.hdmi")}</h3>
      <p class="hint">{t("inputs.hdmiHint")}</p>
      <ChoiceGroup
        id="input-visibility"
        label={t("inputs.hdmiVisibility")}
        value={settings.hideDisconnectedHdmi}
        options={INPUT_VISIBILITY_OPTIONS}
        onSelect={actions.setHdmiVisibility}
      />
      <h3>{t("inputs.keepVisible")}</h3>
      <p class="hint">{t("inputs.keepHint")}</p>
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
      <h3>{t("inputs.names")}</h3>
      <div id="input-names" class="units">
        {inputs.map((input) => (
          <InputName key={input.port} {...input} name={settings.inputNames[input.port]} actions={actions} />
        ))}
      </div>
    </>
  );
};
