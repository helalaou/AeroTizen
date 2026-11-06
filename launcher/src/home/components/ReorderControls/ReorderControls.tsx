import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-preact";

import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon";
import type { HomeEnvironment } from "../../types";

import styles from "./ReorderControls.module.css";
const DIRECTION_ICONS = [
  { direction: "left", icon: ChevronLeft },
  { direction: "right", icon: ChevronRight },
  { direction: "up", icon: ChevronUp },
  { direction: "down", icon: ChevronDown },
] as const;
export const ReorderControls = ({ env, id }: { env: HomeEnvironment; id: string }) => {
  const { draft } = useStore(env.state);
  const { language } = useTranslation();
  const settings = useStore(env.settings);
  const ids = draft || settings.home;
  const index = ids.indexOf(id);
  const columns = env.columns(settings);
  const allowed = {
    left: language === "ar" ? index < ids.length - 1 : index > 0,
    right: language === "ar" ? index > 0 : index < ids.length - 1,
    up: settings.homeAppLayout !== "scroll" && index >= columns,
    down: settings.homeAppLayout !== "scroll" && index + columns < ids.length,
  };
  return (
    <>
      {DIRECTION_ICONS.filter(({ direction }) => allowed[direction]).map(({ direction, icon }) => (
        <div key={direction} class={styles.arrow} data-reorder-arrow data-direction={direction} aria-hidden="true">
          <Icon icon={icon} />
        </div>
      ))}
    </>
  );
};
