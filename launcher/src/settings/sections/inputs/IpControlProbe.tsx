import { useRef, useState } from "preact/hooks";

import type { LearnIpControlResult } from "../../../contracts/ipControl";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { ChoiceOption } from "../../components/ChoiceOption/ChoiceOption";
import { ControlGroup } from "../../components/ControlGroup/ControlGroup";
import { SettingsHint } from "../../components/SettingsHint/SettingsHint";
import { SettingsSection } from "../../components/SettingsSection/SettingsSection";
import { useSettingsEnvironment } from "../../hooks/useSettingsEnvironment";

export const IpControlProbe = () => {
  const { t } = useTranslation();
  const { services } = useSettingsEnvironment();
  const [result, setResult] = useState<LearnIpControlResult | { status: "waiting" }>();
  const running = useRef(false);

  const run = async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    setResult({ status: "waiting" });
    try {
      setResult(await services.learnIpControlInput());
    } finally {
      running.current = false;
    }
  };

  const message =
    result &&
    result.status !== "added" &&
    t(`inputs.ipProbe.${result.status}`, "port" in result ? { port: result.port } : undefined);

  return (
    <SettingsSection title={t("inputs.ipProbeTitle")} description={t("inputs.ipProbeHint")}>
      <SettingsHint role="status" hidden={!message}>
        {message}
      </SettingsHint>
      <ControlGroup id="ip-control-probe-actions">
        <ChoiceOption id="ip-control-probe" onSelect={() => void run()}>
          {t("inputs.ipProbeStart")}
        </ChoiceOption>
      </ControlGroup>
    </SettingsSection>
  );
};
