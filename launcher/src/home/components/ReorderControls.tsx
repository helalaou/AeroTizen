import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-preact";

import { useStore } from "../../shared/hooks/useStore";
import { Icon } from "../../shared/icons/Icon";
import type { HomeEnvironment } from "../types";
const directions = { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown };
export const ReorderControls = ({ env, id }: { env: HomeEnvironment; id: string }) => {
  const { draft } = useStore(env.state),
    settings = useStore(env.settings);
  const ids = draft || settings.home,
    index = ids.indexOf(id),
    columns = env.columns(settings);
  const allowed = {
    left: index > 0,
    right: index < ids.length - 1,
    up: index >= columns,
    down: index + columns < ids.length,
  };
  return (
    <>
      {(Object.keys(directions) as (keyof typeof directions)[])
        .filter((direction) => allowed[direction])
        .map((direction) => (
          <div key={direction} class={"move-arrow " + direction} aria-hidden="true">
            <Icon icon={directions[direction]} color="#111" />
          </div>
        ))}
    </>
  );
};
