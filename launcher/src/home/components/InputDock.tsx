import type { InputSource } from "../../contracts/launcher";
import { useTranslation } from "../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../types";

import { HomeSectionHeading } from "./HomeSectionHeading";
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
    <section id="inputs-section" hidden={!visible || !inputs.length}>
      <HomeSectionHeading title={t("common.inputs")} />
      <div id="inputs" class={"row small input-dock" + (inputs.length < 5 ? " input-dock--compact" : "")}>
        {inputs.map((source) => (
          <InputCard key={env.runtime.inputs.portName(source)} env={env} source={source} glass={glass} />
        ))}
      </div>
    </section>
  );
};
