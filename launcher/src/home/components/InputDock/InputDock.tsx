import type { InputSource } from "../../../contracts/launcher";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";
import { HomeSectionHeading } from "../HomeSectionHeading/HomeSectionHeading";
import { InputCard } from "../InputCard/InputCard";

import styles from "./InputDock.module.css";

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
  const compact = inputs.length < 5;
  return (
    <section id="inputs-section" data-home-section="inputs" hidden={!visible || !inputs.length}>
      <HomeSectionHeading title={t("common.inputs")} />
      <div
        id="inputs"
        class={styles.dock}
        data-input-dock
        data-variant={glass ? "glass" : "classic"}
        data-compact={compact ? "true" : "false"}
      >
        {inputs.map((source) => (
          <InputCard
            key={env.runtime.inputs.portName(source)}
            env={env}
            source={source}
            glass={glass}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );
};
