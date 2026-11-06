import { Check } from "lucide-preact";

import { Icon } from "../../../shared/icons/Icon/Icon";

import styles from "./SelectionIndicator.module.css";

export const SelectionIndicator = ({ small = false }: { small?: boolean }) => (
  <div class={styles.indicator + (small ? " " + styles.small : "")} data-selection-indicator aria-hidden="true">
    <Icon icon={Check} />
  </div>
);
