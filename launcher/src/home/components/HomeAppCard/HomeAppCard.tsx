import type { ComponentChildren } from "preact";

import { useStoreSelector } from "../../../shared/hooks/useStore";
import type { HomeEnvironment } from "../../types";
import { HomeControl } from "../HomeControl/HomeControl";
import { ReorderControls } from "../ReorderControls/ReorderControls";

import styles from "./HomeAppCard.module.css";

export const HomeAppCard = ({
  env,
  id,
  controlKey,
  title,
  registered,
  children,
  className = "",
}: {
  env: HomeEnvironment;
  id?: string;
  controlKey: string;
  title: string;
  registered: boolean;
  children: ComponentChildren;
  className?: string;
}) => {
  const isMoving = useStoreSelector(env.state, (state) => !!id && state.moving === id);
  return (
    <HomeControl
      env={env}
      controlKey={controlKey}
      dataId={id}
      moving={isMoving}
      registered={registered}
      className={styles.card + " " + className}
      title={title}
    >
      {children}
      {isMoving && id ? <ReorderControls env={env} id={id} /> : null}
    </HomeControl>
  );
};
