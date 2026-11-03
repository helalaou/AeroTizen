import type { InputSource } from "../../contracts/launcher";
import { useTranslation } from "../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../types";

import { InputCard } from "./InputCard";

export const InputDock = ({
  env,
  inputs,
  visible,
  glass,
}: {
  env: HomeEnvironment;
  inputs: readonly InputSource[];
  visible: boolean;
  glass: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <section id="inputs-section" class="row-wrap inputs-wrap" hidden={!visible || !inputs.length}>
      <h2>{t("common.inputs")}</h2>
      <div id="inputs" class={"row small input-dock" + (inputs.length < 5 ? " input-dock--compact" : "")}>
        {inputs.map((source) => (
          <InputCard key={env.runtime.inputs.portName(source)} env={env} source={source} glass={glass} />
        ))}
      </div>
    </section>
  );
};
