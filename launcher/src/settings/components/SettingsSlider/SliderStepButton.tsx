import type { LucideIcon } from "lucide-preact";

import { Icon } from "../../../shared/icons/Icon/Icon";

import styles from "./SettingsSlider.module.css";

interface Props {
  direction: number;
  icon: LucideIcon;
  label: string;
  onAdjust(steps: number): void;
}

export const SliderStepButton = ({ direction, icon, label, onAdjust }: Props) => (
  <button
    type="button"
    class={styles.arrow}
    tabIndex={-1}
    aria-label={label}
    onMouseDown={(event) => event.preventDefault()}
    onClick={(event) => {
      event.stopPropagation();
      onAdjust(direction);
    }}
  >
    <Icon icon={icon} />
  </button>
);
