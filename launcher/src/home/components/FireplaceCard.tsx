import { useStore } from "../../shared/hooks/useStore";
import { FlameIcon } from "../../shared/icons/FlameIcon";
import type { HomeEnvironment } from "../types";

import { HomeControl } from "./HomeControl";
import { ReorderControls } from "./ReorderControls";

export const FireplaceCard = ({ env, registered }: { env: HomeEnvironment; registered: boolean }) => {
  const { moving } = useStore(env.state);
  const id = env.runtime.config.FIREPLACE_ID;
  return (
    <HomeControl
      env={env}
      controlKey={"app:" + id}
      dataId={id}
      registered={registered}
      className={"tile fire" + (moving === id ? " moving" : "")}
      title={env.translate("Fireplace")}
    >
      <FlameIcon />
      {moving === id ? <ReorderControls env={env} id={id} /> : null}
    </HomeControl>
  );
};
