import type { JSX } from "preact";

import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";

import styles from "./SettingsAppCard.module.css";

export type SettingsAppVariant = "favourite" | "source";

interface Props extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "ref"> {
  class?: string;
  focusKey: string;
  selected?: boolean;
  variant?: SettingsAppVariant;
}

export const SettingsAppCard = ({ class: className = "", selected, variant = "favourite", ...props }: Props) => (
  <SettingsControl
    {...props}
    class={styles.card + " " + className}
    role="button"
    aria-pressed={selected}
    data-settings-card={variant}
  />
);
