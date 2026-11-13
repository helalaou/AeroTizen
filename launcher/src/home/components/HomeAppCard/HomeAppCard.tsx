import type { ComponentChildren } from "preact";

import type { AppPresentation } from "../../../contracts/launcher";
import { AppCard } from "../../../shared/components/AppCard/AppCard";
import { useStoreSelector } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import type { HomeEnvironment } from "../../types";
import { HomeControl } from "../HomeControl/HomeControl";
import { ReorderControls } from "../ReorderControls/ReorderControls";

const HOME_MEMBERSHIP_DESCRIPTION_ID_PREFIX = "app-on-home:";

export const HomeAppCard = ({
  env,
  id,
  title,
  registered,
  children,
  className = "",
  presentation,
  selected,
}: {
  env: HomeEnvironment;
  id: string;
  title: string;
  registered: boolean;
  children?: ComponentChildren;
  className?: string;
  presentation?: AppPresentation;
  selected?: boolean;
}) => {
  const { t } = useTranslation();
  const isMoving = useStoreSelector(env.state, (state) => state.moving === id);
  const descriptionId = selected ? HOME_MEMBERSHIP_DESCRIPTION_ID_PREFIX + id : undefined;
  return (
    <AppCard
      variant="home"
      presentation={presentation}
      active={registered}
      selected={selected}
      renderControl={({ className: cardClassName, children: content }) => (
        <HomeControl
          env={env}
          controlKey={"app:" + id}
          dataId={id}
          moving={isMoving}
          registered={registered}
          className={cardClassName + " " + className}
          title={title}
          descriptionId={descriptionId}
        >
          {content}
        </HomeControl>
      )}
    >
      {descriptionId ? (
        <span id={descriptionId} hidden>
          {t("home.onHome")}
        </span>
      ) : null}
      {children}
      {isMoving ? <ReorderControls env={env} id={id} /> : null}
    </AppCard>
  );
};
