import type { JSX } from "preact";

import styles from "./SettingsPanel.module.css";

interface Props extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> {
  class?: string;
}

export const SettingsPanel = ({ class: className = "", ...props }: Props) => (
  <div {...props} class={styles.panel + " " + className} />
);
